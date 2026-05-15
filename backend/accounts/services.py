from __future__ import annotations

import hashlib
import io
import secrets
import string
import uuid

from PIL import Image, ImageOps, UnidentifiedImageError
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from accounts.models import EmailVerificationToken
from accounts.tokens import RefreshToken

User = get_user_model()
IDENTIFY_CODE_ALPHABET = string.ascii_uppercase + string.digits
IDENTIFY_CODE_LENGTH = 6
MAX_IDENTIFY_CODE_GENERATION_ATTEMPTS = 20
EMAIL_VERIFICATION_SALT = "email-verification"


class EmailVerificationError(Exception):
    """Invalid or expired verification token."""


class IdentityProfileConflictError(Exception):
    """Raised when identity profile operations cannot proceed due to state conflicts."""


class ProfileAlreadyCompletedError(IdentityProfileConflictError):
    pass


class ProfileSetupNotRequiredError(IdentityProfileConflictError):
    pass


class ProfileNotCompletedError(IdentityProfileConflictError):
    pass


class IdentifyCodeGenerationError(Exception):
    pass


# -------- Avatar Validation Constants --------

ALLOWED_AVATAR_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_AVATAR_BYTES = 500 * 1024
MAX_AVATAR_DIMENSION = 1024
AVATAR_OUTPUT_SIZE = 512
AVATAR_OUTPUT_QUALITIES = (85, 75, 65)
AVATAR_MAGIC_SIGNATURES = (
    b"\xff\xd8\xff",          # JPEG
    b"\x89PNG\r\n\x1a\n",     # PNG
    b"RIFF",                  # WebP (RIFF container — followed by 4 bytes size + "WEBP")
)


class AvatarValidationError(Exception):
    """Raised by update_avatar when an uploaded file fails validation. Carries an error_code."""

    def __init__(self, error_code: str, detail: str) -> None:
        super().__init__(detail)
        self.error_code = error_code
        self.detail = detail


class PasswordChangeError(Exception):
    """Raised by change_password_with_current when validation fails."""

    def __init__(self, error_code: str, detail: str) -> None:
        super().__init__(detail)
        self.error_code = error_code
        self.detail = detail


def _delete_storage_file(storage, name: str) -> None:
    try:
        storage.delete(name)
    except Exception:
        # Orphan file; intentional best-effort cleanup.
        pass


def generate_identify_code() -> str:
    return "".join(secrets.choice(IDENTIFY_CODE_ALPHABET) for _ in range(IDENTIFY_CODE_LENGTH))


def build_display_name(first_name: str, last_name: str) -> str:
    return f"{first_name} {last_name}"


def generate_email_verification_token(user: User) -> str:
    signer = signing.TimestampSigner(salt=EMAIL_VERIFICATION_SALT)
    token = signer.sign(str(user.pk))
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    EmailVerificationToken.objects.get_or_create(user=user, token_hash=token_hash)
    return token


def verify_email_token(token: str) -> User:
    signer = signing.TimestampSigner(salt=EMAIL_VERIFICATION_SALT)
    try:
        user_pk = signer.unsign(token, max_age=settings.EMAIL_VERIFICATION_MAX_AGE_SECONDS)
    except (signing.BadSignature, signing.SignatureExpired) as exc:
        raise EmailVerificationError("Invalid or expired verification token.") from exc

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with transaction.atomic():
        try:
            token_record = EmailVerificationToken.objects.select_for_update().get(
                token_hash=token_hash
            )
        except EmailVerificationToken.DoesNotExist as exc:
            raise EmailVerificationError("Invalid or expired verification token.") from exc

        if token_record.is_used():
            raise EmailVerificationError("Invalid or expired verification token.")

        try:
            user = User.objects.get(pk=user_pk)
        except User.DoesNotExist as exc:
            raise EmailVerificationError("Invalid or expired verification token.") from exc

        token_record.used_at = timezone.now()
        token_record.save(update_fields=["used_at"])
        return user


def confirm_email(user: User) -> User:
    with transaction.atomic():
        locked_user = User.objects.select_for_update().get(pk=user.pk)
        if not locked_user.email_verified:
            locked_user.email_verified = True
            locked_user.email_verified_at = timezone.now()
            locked_user.save(update_fields=["email_verified", "email_verified_at", "updated_at"])
        return locked_user


def send_verification_email(user: User) -> None:
    token = generate_email_verification_token(user)
    verification_url = f"{settings.FRONTEND_BASE_URL}/api/auth/verify-email?token={token}"
    body = render_to_string("accounts/verify_email.txt", {"verification_url": verification_url})
    send_mail(
        subject="Verify your GoPlan email address",
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )


def build_user_payload(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "display_name": user.display_name,
        "identify_name": user.identify_name,
        "identify_code": user.identify_code,
        "identify_tag": user.identify_tag,
        "avatar_url": user.avatar.url if user.avatar else None,
        "email_verified": user.email_verified,
        "is_profile_completed": user.is_profile_completed,
        "requires_profile_setup": user.requires_profile_setup,
    }


def build_auth_response(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    return {
        "user": build_user_payload(user),
        "tokens": {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "token_type": "Bearer",
        },
    }


def complete_profile_identity(user: User, first_name: str, last_name: str, identify_name: str) -> User:
    if user.is_staff or user.is_superuser:
        raise ProfileSetupNotRequiredError("Profile setup is not required for admin users.")

    last_exception: IntegrityError | None = None
    for _ in range(MAX_IDENTIFY_CODE_GENERATION_ATTEMPTS):
        try:
            with transaction.atomic():
                locked_user = User.objects.select_for_update().get(pk=user.pk)

                if locked_user.is_staff or locked_user.is_superuser:
                    raise ProfileSetupNotRequiredError("Profile setup is not required for admin users.")
                if locked_user.is_profile_completed:
                    raise ProfileAlreadyCompletedError("Profile is already completed.")

                locked_user.first_name = first_name
                locked_user.last_name = last_name
                locked_user.display_name = build_display_name(first_name, last_name)
                locked_user.identify_name = identify_name
                locked_user.identify_code = generate_identify_code()
                locked_user.is_profile_completed = True
                locked_user.profile_completed_at = timezone.now()
                locked_user.save(
                    update_fields=[
                        "first_name",
                        "last_name",
                        "display_name",
                        "identify_name",
                        "identify_code",
                        "is_profile_completed",
                        "profile_completed_at",
                        "updated_at",
                    ]
                )
                return locked_user
        except IntegrityError as exc:
            last_exception = exc

    raise IdentifyCodeGenerationError("Unable to generate a unique identify code.") from last_exception


def blacklist_all_user_refresh_tokens(user: User) -> None:
    existing_ids = set(
        BlacklistedToken.objects.filter(token__user=user).values_list("token_id", flat=True)
    )
    to_blacklist = OutstandingToken.objects.filter(user=user).exclude(id__in=existing_ids)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in to_blacklist],
        ignore_conflicts=True,
    )


def update_display_name(user: User, first_name: str, last_name: str) -> User:
    with transaction.atomic():
        locked_user = User.objects.select_for_update().get(pk=user.pk)

        if not locked_user.is_profile_completed:
            raise ProfileNotCompletedError("Profile setup is required before updating display name.")

        locked_user.first_name = first_name
        locked_user.last_name = last_name
        locked_user.display_name = build_display_name(first_name, last_name)
        locked_user.save(update_fields=["first_name", "last_name", "display_name", "updated_at"])
        return locked_user


def generate_password_reset_url(user: User) -> str:
    uid = urlsafe_base64_encode(force_bytes(str(user.pk)))
    token = default_token_generator.make_token(user)
    return f"{settings.FRONTEND_BASE_URL}/reset-password?uid={uid}&token={token}"


def send_password_reset_email(user: User) -> None:
    reset_url = generate_password_reset_url(user)
    body = render_to_string("accounts/password_reset.txt", {"reset_url": reset_url})
    send_mail(
        subject="Reset your GoPlan password",
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )


def reset_user_password(user: User, new_password: str) -> User:
    with transaction.atomic():
        locked_user = User.objects.select_for_update().get(pk=user.pk)
        locked_user.set_password(new_password)
        locked_user.auth_version += 1
        locked_user.save(update_fields=["password", "auth_version", "updated_at"])
        blacklist_all_user_refresh_tokens(locked_user)
    return locked_user


# -------- Avatar Services --------


def _check_avatar_magic_bytes(image_file) -> bool:
    image_file.seek(0)
    header = image_file.read(12)
    image_file.seek(0)
    if header.startswith(b"\xff\xd8\xff"):
        return True
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return True
    return False


def _image_has_alpha(image: Image.Image) -> bool:
    return "A" in image.getbands() or "transparency" in image.info


def _render_clean_avatar_webp(image_file) -> ContentFile:
    """
    Re-encode every accepted avatar server-side.

    This strips EXIF/GPS metadata, normalizes orientation, center-crops to a
    stable square, and avoids trusting client-side crop/encode behavior.
    """
    image_file.seek(0)
    try:
        with Image.open(image_file) as source:
            if getattr(source, "is_animated", False):
                raise AvatarValidationError(
                    "AVATAR_INVALID_FORMAT",
                    "Animated avatar images are not supported.",
                )

            normalized = ImageOps.exif_transpose(source)
            target_mode = "RGBA" if _image_has_alpha(normalized) else "RGB"
            if normalized.mode != target_mode:
                normalized = normalized.convert(target_mode)

            clean = ImageOps.fit(
                normalized,
                (AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE),
                method=Image.Resampling.LANCZOS,
                centering=(0.5, 0.5),
            )
            for quality in AVATAR_OUTPUT_QUALITIES:
                output = io.BytesIO()
                clean.save(output, format="WEBP", quality=quality, method=6)
                content = output.getvalue()
                if len(content) <= MAX_AVATAR_BYTES:
                    return ContentFile(content)
    except AvatarValidationError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise AvatarValidationError(
            "AVATAR_INVALID_FORMAT",
            "Image could not be parsed safely.",
        ) from exc
    finally:
        image_file.seek(0)

    raise AvatarValidationError(
        "AVATAR_TOO_LARGE",
        f"Avatar file exceeds {MAX_AVATAR_BYTES // 1024}KB limit after processing.",
    )


def update_avatar(user, image_file):
    """
    Validates an uploaded image and stores it as the user's avatar.

    Validation order (cheapest first, fail fast):
      1. size <= MAX_AVATAR_BYTES
      2. magic-byte sniffing for JPEG / PNG / WebP
      3. Pillow Image.verify() — refuses malformed/decompression-bomb files
      4. format in ALLOWED_AVATAR_FORMATS and dimensions <= MAX_AVATAR_DIMENSION

    Replacement strategy: write new file first, save user pointing at it,
    then delete the old file. If old-file deletion fails we log and move on —
    an orphan file is a leak, not a correctness issue.
    """
    if image_file.size > MAX_AVATAR_BYTES:
        raise AvatarValidationError(
            "AVATAR_TOO_LARGE",
            f"Avatar file exceeds {MAX_AVATAR_BYTES // 1024}KB limit.",
        )

    if not _check_avatar_magic_bytes(image_file):
        raise AvatarValidationError(
            "AVATAR_INVALID_FORMAT",
            "Unsupported image format. Use JPEG, PNG, or WebP.",
        )

    image_file.seek(0)
    try:
        with Image.open(image_file) as probe:
            probe.verify()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise AvatarValidationError(
            "AVATAR_INVALID_FORMAT",
            "Image could not be parsed safely.",
        ) from exc

    image_file.seek(0)
    with Image.open(image_file) as probed:
        if probed.format not in ALLOWED_AVATAR_FORMATS:
            raise AvatarValidationError(
                "AVATAR_INVALID_FORMAT",
                f"Unsupported image format: {probed.format}.",
            )
        if probed.width > MAX_AVATAR_DIMENSION or probed.height > MAX_AVATAR_DIMENSION:
            raise AvatarValidationError(
                "AVATAR_DIMENSIONS_TOO_LARGE",
                f"Image dimensions exceed {MAX_AVATAR_DIMENSION}x{MAX_AVATAR_DIMENSION}.",
            )
        probed.load()

    clean_avatar = _render_clean_avatar_webp(image_file)
    new_name = f"{uuid.uuid4().hex}.webp"

    old_name = None
    old_storage = None
    with transaction.atomic():
        locked_user = User.objects.select_for_update().get(pk=user.pk)

        # FieldFile.save() mutates the same FieldFile instance (rebinds .name to
        # the new path). Capture the previous name and storage BEFORE saving so
        # we can delete the old file without touching the newly-written one.
        if locked_user.avatar:
            old_name = locked_user.avatar.name
            old_storage = locked_user.avatar.storage

        locked_user.avatar.save(new_name, clean_avatar, save=False)
        locked_user.save(update_fields=["avatar", "updated_at"])

    user.avatar = locked_user.avatar.name
    user.updated_at = locked_user.updated_at
    if old_name and old_storage is not None:
        _delete_storage_file(old_storage, old_name)

    return user


def delete_avatar(user):
    """
    Idempotent. Removes the avatar file from storage and clears the field.
    No-op (returns user untouched) if user has no avatar.
    """
    old_name = None
    old_storage = None
    with transaction.atomic():
        locked_user = User.objects.select_for_update().get(pk=user.pk)
        if not locked_user.avatar:
            user.avatar = None
            user.updated_at = locked_user.updated_at
            return user

        old_name = locked_user.avatar.name
        old_storage = locked_user.avatar.storage
        locked_user.avatar = None
        locked_user.save(update_fields=["avatar", "updated_at"])

    user.avatar = None
    user.updated_at = locked_user.updated_at
    if old_name and old_storage is not None:
        _delete_storage_file(old_storage, old_name)
    return user


# -------- Password Change Service --------


def change_password_with_current(user, current_password: str, new_password: str):
    """
    Atomically: verify current password, validate new, set_password, bump auth_version,
    issue a fresh access+refresh pair using the same path login uses.

    Returns (user, access_token_str, refresh_token_str).

    Tokens are minted *after* auth_version is incremented so they encode the new
    version and remain valid; every previously issued token for this user (other
    devices, other tabs) now fails the auth_version check in authentication.py.
    """
    with transaction.atomic():
        locked = User.objects.select_for_update().get(pk=user.pk)

        if not locked.check_password(current_password):
            raise PasswordChangeError(
                "INVALID_CURRENT_PASSWORD",
                "Current password is incorrect.",
            )

        if current_password == new_password:
            raise PasswordChangeError(
                "SAME_PASSWORD",
                "New password must differ from current password.",
            )

        try:
            validate_password(new_password, user=locked)
        except DjangoValidationError as exc:
            raise PasswordChangeError(
                "WEAK_PASSWORD",
                "; ".join(exc.messages),
            ) from exc

        locked.set_password(new_password)
        locked.auth_version = (locked.auth_version or 0) + 1
        locked.save(update_fields=["password", "auth_version", "updated_at"])

        refresh = RefreshToken.for_user(locked)
        return locked, str(refresh.access_token), str(refresh)
