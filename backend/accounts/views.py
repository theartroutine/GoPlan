from __future__ import annotations

from django.utils.encoding import force_str
from rest_framework import serializers
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import (
    INVALID_FIRST_NAME_CODE,
    INVALID_IDENTIFY_NAME_CODE,
    INVALID_LAST_NAME_CODE,
    LoginSerializer,
    LogoutSerializer,
    ProfileNameUpdateSerializer,
    ProfileSetupSerializer,
    RefreshTokenSerializer,
    RegisterSerializer,
    ResendVerificationSerializer,
)
from accounts.services import (
    EmailVerificationError,
    IdentifyCodeGenerationError,
    IdentityProfileConflictError,
    ProfileAlreadyCompletedError,
    ProfileNotCompletedError,
    ProfileSetupNotRequiredError,
    build_auth_response,
    build_user_payload,
    confirm_email,
    verify_email_token,
)

IDENTITY_VALIDATION_CODE_BY_FIELD = {
    "first_name": INVALID_FIRST_NAME_CODE,
    "last_name": INVALID_LAST_NAME_CODE,
    "identify_name": INVALID_IDENTIFY_NAME_CODE,
}
DEFAULT_IDENTITY_VALIDATION_CODE = "INVALID_IDENTITY_PAYLOAD"


def build_identity_error(detail: str, error_code: str, *, status_code: int):
    return Response({"detail": detail, "error_code": error_code}, status=status_code)


def build_identity_validation_error(serializer: serializers.Serializer):
    errors = serializer.errors
    for field, error_code in IDENTITY_VALIDATION_CODE_BY_FIELD.items():
        if field not in errors:
            continue
        field_errors = errors[field]
        first_error = field_errors[0] if isinstance(field_errors, list) and field_errors else field_errors
        return build_identity_error(
            detail=force_str(first_error),
            error_code=error_code,
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if "non_field_errors" in errors and errors["non_field_errors"]:
        return build_identity_error(
            detail=force_str(errors["non_field_errors"][0]),
            error_code=DEFAULT_IDENTITY_VALIDATION_CODE,
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    return build_identity_error(
        detail="Invalid identity payload.",
        error_code=DEFAULT_IDENTITY_VALIDATION_CODE,
        status_code=status.HTTP_400_BAD_REQUEST,
    )


def build_identity_conflict_error(exc: IdentityProfileConflictError):
    if isinstance(exc, ProfileSetupNotRequiredError):
        return build_identity_error(
            detail=str(exc),
            error_code="PROFILE_SETUP_NOT_REQUIRED",
            status_code=status.HTTP_409_CONFLICT,
        )
    if isinstance(exc, ProfileAlreadyCompletedError):
        return build_identity_error(
            detail=str(exc),
            error_code="PROFILE_ALREADY_COMPLETED",
            status_code=status.HTTP_409_CONFLICT,
        )
    if isinstance(exc, ProfileNotCompletedError):
        return build_identity_error(
            detail=str(exc),
            error_code="PROFILE_SETUP_REQUIRED",
            status_code=status.HTTP_409_CONFLICT,
        )
    return build_identity_error(
        detail=str(exc),
        error_code="IDENTITY_PROFILE_CONFLICT",
        status_code=status.HTTP_409_CONFLICT,
    )


class RegisterAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_register"

    def post(self, request, *args, **kwargs):
        serializer = RegisterSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {"detail": "Verification email sent. Please check your inbox.", "email": user.email},
            status=status.HTTP_201_CREATED,
        )


class LoginAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_login"

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        if user.requires_email_verification:
            return Response(
                {"detail": "Please verify your email address before signing in.",
                 "error_code": "EMAIL_NOT_VERIFIED"},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = build_auth_response(user)
        return Response(payload, status=status.HTTP_200_OK)


class VerifyEmailAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_verify_email"

    def get(self, request, *args, **kwargs):
        token = request.query_params.get("token")
        if not token:
            return Response(
                {"detail": "Verification token is required.", "error_code": "INVALID_OR_EXPIRED_TOKEN"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user = verify_email_token(token)
        except EmailVerificationError:
            return Response(
                {"detail": "Verification link is invalid or expired.", "error_code": "INVALID_OR_EXPIRED_TOKEN"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        confirm_email(user)
        payload = build_auth_response(user)
        return Response(payload, status=status.HTTP_200_OK)


class ResendVerificationAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_resend_verification"

    def post(self, request, *args, **kwargs):
        serializer = ResendVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "If an account exists with that email, a verification link has been sent."},
            status=status.HTTP_200_OK,
        )


class MeAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_me"

    def get(self, request, *args, **kwargs):
        return Response({"user": build_user_payload(request.user)}, status=status.HTTP_200_OK)


class RefreshAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_refresh"

    def post(self, request, *args, **kwargs):
        serializer = RefreshTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class LogoutAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_logout"

    def post(self, request, *args, **kwargs):
        serializer = LogoutSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Logout successful."}, status=status.HTTP_200_OK)


class ProfileSetupAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_profile_setup"

    def post(self, request, *args, **kwargs):
        if request.user.is_staff or request.user.is_superuser:
            return build_identity_error(
                detail="Profile setup is not required for admin users.",
                error_code="PROFILE_SETUP_NOT_REQUIRED",
                status_code=status.HTTP_409_CONFLICT,
            )
        if request.user.is_profile_completed:
            return build_identity_error(
                detail="Profile is already completed.",
                error_code="PROFILE_ALREADY_COMPLETED",
                status_code=status.HTTP_409_CONFLICT,
            )

        serializer = ProfileSetupSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            return build_identity_validation_error(serializer)
        try:
            user = serializer.save()
        except IdentifyCodeGenerationError:
            return build_identity_error(
                detail="Unable to generate identify code. Please try again.",
                error_code="IDENTIFY_CODE_GENERATION_FAILED",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except IdentityProfileConflictError as exc:
            return build_identity_conflict_error(exc)

        return Response({"user": build_user_payload(user)}, status=status.HTTP_200_OK)


class ProfileNameUpdateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_profile_name"

    def patch(self, request, *args, **kwargs):
        if not request.user.is_profile_completed:
            return build_identity_error(
                detail="Profile setup is required before updating display name.",
                error_code="PROFILE_SETUP_REQUIRED",
                status_code=status.HTTP_409_CONFLICT,
            )

        serializer = ProfileNameUpdateSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            return build_identity_validation_error(serializer)
        try:
            user = serializer.save()
        except IdentityProfileConflictError as exc:
            return build_identity_conflict_error(exc)

        return Response({"user": build_user_payload(user)}, status=status.HTTP_200_OK)
