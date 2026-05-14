from __future__ import annotations

import logging
import re
import unicodedata
from smtplib import SMTPException

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import TokenError

from accounts.tokens import RefreshToken

from accounts.services import (
    complete_profile_identity,
    reset_user_password,
    send_password_reset_email,
    send_verification_email,
    update_display_name,
)

logger = logging.getLogger(__name__)

User = get_user_model()
IDENTIFY_NAME_PATTERN = re.compile(r"^[a-z]{3,24}$")
NAME_MAX_LENGTH = 15
NAME_SEPARATORS = {"-", "'"}
DISALLOWED_UNICODE_CATEGORIES = {"Cc", "Cf", "Cs", "Co", "Cn"}
INVALID_FIRST_NAME_CODE = "INVALID_FIRST_NAME"
INVALID_LAST_NAME_CODE = "INVALID_LAST_NAME"
INVALID_IDENTIFY_NAME_CODE = "INVALID_IDENTIFY_NAME"


def normalize_whitespace(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    return " ".join(normalized.strip().split())


def validate_human_name(value: str, field_name: str, error_code: str) -> str:
    normalized = normalize_whitespace(value)
    if not normalized:
        raise serializers.ValidationError(f"{field_name} cannot be empty.", code=error_code)
    if len(normalized) > NAME_MAX_LENGTH:
        raise serializers.ValidationError(
            f"{field_name} must be at most {NAME_MAX_LENGTH} characters.",
            code=error_code,
        )
    if " " in normalized:
        raise serializers.ValidationError(
            f"{field_name} must be a single word (no spaces).",
            code=error_code,
        )

    if normalized[0] in NAME_SEPARATORS or normalized[-1] in NAME_SEPARATORS:
        raise serializers.ValidationError(
            f"{field_name} cannot start or end with a separator.",
            code=error_code,
        )

    previous_was_separator = False
    for character in normalized:
        if unicodedata.category(character) in DISALLOWED_UNICODE_CATEGORIES:
            raise serializers.ValidationError(
                f"{field_name} contains invalid characters.",
                code=error_code,
            )

        if character in NAME_SEPARATORS:
            if previous_was_separator:
                raise serializers.ValidationError(
                    f"{field_name} cannot contain adjacent separators.",
                    code=error_code,
                )
            previous_was_separator = True
            continue

        previous_was_separator = False
        category = unicodedata.category(character)
        if category.startswith("L") or category in {"Mn", "Mc", "Me"}:
            continue

        raise serializers.ValidationError(
            f"{field_name} contains invalid characters.",
            code=error_code,
        )

    return normalized


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)

    def validate_email(self, value: str) -> str:
        return User.objects.normalize_email_value(value)

    def validate_password(self, value: str) -> str:
        candidate_user = User(email=self.initial_data.get("email", ""))
        try:
            validate_password(value, user=candidate_user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def create(self, validated_data):
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    email=validated_data["email"],
                    password=validated_data["password"],
                )
        except IntegrityError:
            return User(email=validated_data["email"])

        try:
            send_verification_email(user)
        except (SMTPException, OSError):
            logger.exception("Failed to send verification email for user %s", user.pk)

        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        email = User.objects.normalize_email_value(attrs["email"])
        password = attrs["password"]
        request = self.context.get("request")

        user = authenticate(request=request, email=email, password=password)
        if user is None or not user.is_active:
            raise AuthenticationFailed("Invalid email or password.")

        attrs["user"] = user
        return attrs


class HumanNameValidationMixin:
    def validate_first_name(self, value: str) -> str:
        return validate_human_name(value, "first_name", INVALID_FIRST_NAME_CODE)

    def validate_last_name(self, value: str) -> str:
        return validate_human_name(value, "last_name", INVALID_LAST_NAME_CODE)


class ProfileSetupSerializer(HumanNameValidationMixin, serializers.Serializer):
    first_name = serializers.CharField(max_length=NAME_MAX_LENGTH, trim_whitespace=False)
    last_name = serializers.CharField(max_length=NAME_MAX_LENGTH, trim_whitespace=False)
    identify_name = serializers.CharField(max_length=24, trim_whitespace=False)

    def validate_identify_name(self, value: str) -> str:
        normalized = normalize_whitespace(value).lower()
        if not IDENTIFY_NAME_PATTERN.fullmatch(normalized):
            raise serializers.ValidationError(
                "identify_name must contain only lowercase letters and be between 3 and 24 characters.",
                code=INVALID_IDENTIFY_NAME_CODE,
            )
        return normalized

    def save(self, **kwargs):
        user = self.context["request"].user
        return complete_profile_identity(
            user=user,
            first_name=self.validated_data["first_name"],
            last_name=self.validated_data["last_name"],
            identify_name=self.validated_data["identify_name"],
        )


class ProfileNameUpdateSerializer(HumanNameValidationMixin, serializers.Serializer):
    first_name = serializers.CharField(max_length=NAME_MAX_LENGTH, trim_whitespace=False)
    last_name = serializers.CharField(max_length=NAME_MAX_LENGTH, trim_whitespace=False)

    def save(self, **kwargs):
        user = self.context["request"].user
        return update_display_name(
            user=user,
            first_name=self.validated_data["first_name"],
            last_name=self.validated_data["last_name"],
        )


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value: str) -> str:
        return User.objects.normalize_email_value(value)

    def save(self, **kwargs):
        email = self.validated_data["email"]
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return  # Anti-enumeration: silently succeed

        if user.email_verified or user.is_staff or user.is_superuser:
            return  # Already verified or admin — no email sent

        try:
            send_verification_email(user)
        except (SMTPException, OSError):
            logger.exception("Failed to send verification email for user %s", user.pk)


class RefreshTokenSerializer(serializers.Serializer):
    refresh = serializers.CharField(write_only=True)

    def validate(self, attrs):
        try:
            token = RefreshToken(attrs["refresh"])
        except TokenError as exc:
            raise InvalidToken(exc.args[0]) from exc

        user_id = token.payload.get("user_id")
        token_auth_version = token.payload.get("auth_version")
        if user_id is None or token_auth_version is None:
            raise InvalidToken("Token is invalid.")

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise InvalidToken("Token is invalid.")

        if not user.is_active:
            raise InvalidToken("User account is disabled.")

        if token_auth_version != user.auth_version:
            raise InvalidToken("Token has been revoked.")

        token_serializer = TokenRefreshSerializer(data={"refresh": attrs["refresh"]})
        try:
            token_serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            raise InvalidToken(exc.args[0]) from exc
        return token_serializer.validated_data


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(write_only=True)

    def validate(self, attrs):
        request = self.context["request"]
        refresh_value = attrs["refresh"]

        try:
            token = RefreshToken(refresh_value)
        except TokenError:
            attrs["token"] = None
            return attrs

        token_user_id = token.payload.get("user_id")
        if token_user_id is None:
            attrs["token"] = None
            return attrs

        if str(token_user_id) != str(request.user.id):
            raise PermissionDenied("You cannot revoke a token that does not belong to the authenticated user.")

        attrs["token"] = token
        return attrs

    def save(self, **kwargs):
        token = self.validated_data.get("token")
        if token is None:
            return None

        try:
            token.blacklist()
        except TokenError:
            # Idempotent behavior: token may already be invalid/blacklisted.
            return None

        return None


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value: str) -> str:
        return User.objects.normalize_email_value(value)

    def save(self, **kwargs):
        email = self.validated_data["email"]
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return  # Anti-enumeration: silently succeed

        if not user.is_active or user.is_staff or user.is_superuser:
            return  # Skip admin/inactive users

        if not user.email_verified:
            return  # Only verified users can reset password

        try:
            send_password_reset_email(user)
        except (SMTPException, OSError):
            logger.exception("Failed to send password reset email for user %s", user.pk)


class PasswordResetConfirmSerializer(serializers.Serializer):
    INVALID_RESET_LINK_ERROR = {"detail": "Invalid or expired reset link.", "error_code": "INVALID_OR_EXPIRED_TOKEN"}

    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)

    def validate(self, attrs):
        try:
            uid = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=uid)
        except (ValueError, TypeError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError(self.INVALID_RESET_LINK_ERROR)

        if not user.is_active or user.is_staff or user.is_superuser:
            raise serializers.ValidationError(self.INVALID_RESET_LINK_ERROR)

        if not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError(self.INVALID_RESET_LINK_ERROR)

        try:
            validate_password(attrs["password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})

        attrs["user"] = user
        return attrs

    def save(self, **kwargs):
        return reset_user_password(
            user=self.validated_data["user"],
            new_password=self.validated_data["password"],
        )


# -------- Account Management Serializers --------


class AvatarUploadSerializer(serializers.Serializer):
    """
    Uses FileField (not ImageField) so all validation — magic bytes, Pillow verify,
    size, dimensions — happens inside update_avatar() where the error_code contract
    can emit AVATAR_INVALID_FORMAT / AVATAR_TOO_LARGE / AVATAR_DIMENSIONS_TOO_LARGE
    correctly. DRF's ImageField would shortcut with its own generic error message.
    """

    avatar = serializers.FileField(required=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(
        write_only=True, min_length=8, trim_whitespace=False
    )
