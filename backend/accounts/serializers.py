from __future__ import annotations

import re
import unicodedata

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

from accounts.services import complete_profile_identity, update_display_name

User = get_user_model()
GENERIC_REGISTER_ERROR = "Unable to register with provided credentials."
IDENTIFY_NAME_PATTERN = re.compile(r"^[a-z]{3,24}$")
NAME_MAX_LENGTH = 80
NAME_SEPARATORS = {" ", "-", "'"}
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
                return User.objects.create_user(
                    email=validated_data["email"],
                    password=validated_data["password"],
                )
        except IntegrityError as exc:
            raise serializers.ValidationError({"detail": GENERIC_REGISTER_ERROR}) from exc


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


class RefreshTokenSerializer(serializers.Serializer):
    refresh = serializers.CharField(write_only=True)

    def validate(self, attrs):
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
