from __future__ import annotations

import secrets
import string

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

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


def generate_identify_code() -> str:
    return "".join(secrets.choice(IDENTIFY_CODE_ALPHABET) for _ in range(IDENTIFY_CODE_LENGTH))


def build_display_name(first_name: str, last_name: str) -> str:
    return f"{first_name} {last_name}"


def generate_email_verification_token(user: User) -> str:
    signer = signing.TimestampSigner(salt=EMAIL_VERIFICATION_SALT)
    return signer.sign(str(user.pk))


def verify_email_token(token: str) -> User:
    signer = signing.TimestampSigner(salt=EMAIL_VERIFICATION_SALT)
    try:
        user_pk = signer.unsign(token, max_age=settings.EMAIL_VERIFICATION_MAX_AGE_SECONDS)
    except (signing.BadSignature, signing.SignatureExpired) as exc:
        raise EmailVerificationError("Invalid or expired verification token.") from exc

    try:
        return User.objects.get(pk=user_pk)
    except User.DoesNotExist as exc:
        raise EmailVerificationError("Invalid or expired verification token.") from exc


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
