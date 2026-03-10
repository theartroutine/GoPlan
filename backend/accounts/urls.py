from django.urls import path

from accounts.views import (
    LoginAPIView,
    LogoutAPIView,
    MeAPIView,
    ProfileNameUpdateAPIView,
    ProfileSetupAPIView,
    RefreshAPIView,
    RegisterAPIView,
    ResendVerificationAPIView,
    VerifyEmailAPIView,
)

app_name = "accounts"

urlpatterns = [
    path("register", RegisterAPIView.as_view(), name="register"),
    path("login", LoginAPIView.as_view(), name="login"),
    path("verify-email", VerifyEmailAPIView.as_view(), name="verify-email"),
    path("resend-verification", ResendVerificationAPIView.as_view(), name="resend-verification"),
    path("me", MeAPIView.as_view(), name="me"),
    path("profile/setup", ProfileSetupAPIView.as_view(), name="profile-setup"),
    path("profile/name", ProfileNameUpdateAPIView.as_view(), name="profile-name"),
    path("refresh", RefreshAPIView.as_view(), name="refresh"),
    path("logout", LogoutAPIView.as_view(), name="logout"),
]
