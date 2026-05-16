from __future__ import annotations

from django.utils.encoding import force_str
from rest_framework import parsers, serializers
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import (
    AvatarUploadSerializer,
    ChangePasswordSerializer,
    INVALID_FIRST_NAME_CODE,
    INVALID_IDENTIFY_NAME_CODE,
    INVALID_LAST_NAME_CODE,
    LoginSerializer,
    LogoutSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileNameUpdateSerializer,
    ProfileSetupSerializer,
    RefreshTokenSerializer,
    RegisterSerializer,
    ResendVerificationSerializer,
)
from accounts.services import (
    AvatarStorageError,
    AvatarValidationError,
    EmailVerificationError,
    IdentifyCodeGenerationError,
    IdentityProfileConflictError,
    PasswordChangeError,
    ProfileAlreadyCompletedError,
    ProfileNotCompletedError,
    ProfileSetupNotRequiredError,
    build_auth_response,
    build_user_payload,
    change_password_with_current,
    confirm_email,
    delete_avatar,
    update_avatar,
    verify_email_token,
)

IDENTITY_VALIDATION_CODE_BY_FIELD = {
    "first_name": INVALID_FIRST_NAME_CODE,
    "last_name": INVALID_LAST_NAME_CODE,
    "identify_name": INVALID_IDENTIFY_NAME_CODE,
}
DEFAULT_IDENTITY_VALIDATION_CODE = "INVALID_IDENTITY_PAYLOAD"
REGISTER_ACCEPTED_DETAIL = "If registration can continue, check your email."


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


def build_password_reset_confirm_error(serializer: serializers.Serializer):
    errors = serializer.errors

    if "detail" in errors and "error_code" in errors:
        detail_errors = errors["detail"]
        error_code_errors = errors["error_code"]
        detail = detail_errors[0] if isinstance(detail_errors, list) and detail_errors else detail_errors
        error_code = (
            error_code_errors[0]
            if isinstance(error_code_errors, list) and error_code_errors
            else error_code_errors
        )
        return Response(
            {"detail": force_str(detail), "error_code": force_str(error_code)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if "non_field_errors" in errors:
        non_field = errors["non_field_errors"]
        if isinstance(non_field, list) and non_field:
            first_error = non_field[0]
            if isinstance(first_error, dict) and "error_code" in first_error:
                return Response(
                    {
                        "detail": first_error.get("detail", "Invalid or expired reset link."),
                        "error_code": first_error["error_code"],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

    if "password" in errors:
        return Response(
            {"password": errors["password"]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(
        {"detail": "Invalid request.", "error_code": "INVALID_OR_EXPIRED_TOKEN"},
        status=status.HTTP_400_BAD_REQUEST,
    )


class RegisterAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_register"

    def post(self, request, *args, **kwargs):
        serializer = RegisterSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": REGISTER_ACCEPTED_DETAIL},
            status=status.HTTP_202_ACCEPTED,
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

    def post(self, request, *args, **kwargs):
        token = request.data.get("token")
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
        if not user.is_active:
            return Response(
                {"detail": "Verification link is invalid or expired.", "error_code": "INVALID_OR_EXPIRED_TOKEN"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = confirm_email(user)
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


class PasswordResetRequestAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_password_reset_request"

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "If an account exists with that email, a password reset link has been sent."},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_password_reset_confirm"

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return build_password_reset_confirm_error(serializer)
        serializer.save()
        return Response(
            {"detail": "Password has been reset successfully."},
            status=status.HTTP_200_OK,
        )


class AvatarAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_avatar"
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def patch(self, request, *args, **kwargs):
        serializer = AvatarUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = update_avatar(request.user, serializer.validated_data["avatar"])
        except AvatarValidationError as exc:
            return Response(
                {"detail": exc.detail, "error_code": exc.error_code},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except AvatarStorageError as exc:
            return Response(
                {"detail": exc.detail, "error_code": exc.error_code},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response({"user": build_user_payload(user)}, status=status.HTTP_200_OK)

    def delete(self, request, *args, **kwargs):
        try:
            user = delete_avatar(request.user)
        except AvatarStorageError as exc:
            return Response(
                {"detail": exc.detail, "error_code": exc.error_code},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response({"user": build_user_payload(user)}, status=status.HTTP_200_OK)


class ChangePasswordAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_password_change"

    def post(self, request, *args, **kwargs):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user, access, refresh = change_password_with_current(
                request.user,
                serializer.validated_data["current_password"],
                serializer.validated_data["new_password"],
            )
        except PasswordChangeError as exc:
            return Response(
                {"detail": exc.detail, "error_code": exc.error_code},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {
                "user": build_user_payload(user),
                "tokens": {"access": access, "refresh": refresh, "token_type": "Bearer"},
            },
            status=status.HTTP_200_OK,
        )
