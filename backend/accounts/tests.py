from __future__ import annotations

import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.services import generate_email_verification_token

User = get_user_model()


class AuthAPITestCase(APITestCase):
    register_url = "/api/auth/register"
    login_url = "/api/auth/login"
    verify_email_url = "/api/auth/verify-email"
    resend_verification_url = "/api/auth/resend-verification"
    me_url = "/api/auth/me"
    profile_setup_url = "/api/auth/profile/setup"
    profile_name_url = "/api/auth/profile/name"
    refresh_url = "/api/auth/refresh"
    logout_url = "/api/auth/logout"

    @staticmethod
    def issue_tokens_for_user(user):
        refresh = RefreshToken.for_user(user)
        return {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }

    def create_verified_user(self, email: str, password: str):
        user = User.objects.create_user(email=email, password=password)
        user.email_verified = True
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified", "email_verified_at", "updated_at"])
        return user

    def create_completed_user(self, email: str, password: str, identify_code: str = "ABC123"):
        user = User.objects.create_user(email=email, password=password)
        user.email_verified = True
        user.email_verified_at = timezone.now()
        user.first_name = "Quang"
        user.last_name = "Minh"
        user.display_name = "Quang Minh"
        user.identify_name = "quangminh"
        user.identify_code = identify_code
        user.is_profile_completed = True
        user.profile_completed_at = timezone.now()
        user.save(
            update_fields=[
                "email_verified",
                "email_verified_at",
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
        return user

    def assert_user_identity_payload(self, payload, *, expected_email: str, expected_requires_setup: bool):
        self.assertIn("id", payload)
        self.assertEqual(payload["email"], expected_email)
        self.assertIn("first_name", payload)
        self.assertIn("last_name", payload)
        self.assertIn("display_name", payload)
        self.assertIn("identify_name", payload)
        self.assertIn("identify_code", payload)
        self.assertIn("identify_tag", payload)
        self.assertIn("is_profile_completed", payload)
        self.assertIn("email_verified", payload)
        self.assertEqual(payload["requires_profile_setup"], expected_requires_setup)
        uuid.UUID(payload["id"])

    # -------- Register --------

    @patch("accounts.serializers.send_verification_email")
    def test_register_success_returns_detail_and_email(self, mock_send):
        payload = {"email": "owner@example.com", "password": "StrongPass#2026"}
        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.count(), 1)
        self.assertIn("detail", response.data)
        self.assertEqual(response.data["email"], payload["email"])
        self.assertNotIn("tokens", response.data)
        self.assertNotIn("user", response.data)

    @patch("accounts.serializers.send_verification_email")
    def test_register_creates_unverified_user(self, mock_send):
        payload = {"email": "owner@example.com", "password": "StrongPass#2026"}
        self.client.post(self.register_url, payload, format="json")

        user = User.objects.get(email="owner@example.com")
        self.assertFalse(user.email_verified)
        self.assertIsNone(user.email_verified_at)

    @patch("accounts.serializers.send_verification_email")
    def test_register_sends_verification_email(self, mock_send):
        payload = {"email": "owner@example.com", "password": "StrongPass#2026"}
        self.client.post(self.register_url, payload, format="json")

        mock_send.assert_called_once()
        called_user = mock_send.call_args[0][0]
        self.assertEqual(called_user.email, "owner@example.com")

    def test_register_rejects_duplicate_email(self):
        User.objects.create_user(email="owner@example.com", password="StrongPass#2026")
        payload = {"email": "OWNER@EXAMPLE.COM", "password": "StrongPass#2026"}

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            str(response.data.get("detail", "")),
            "Unable to register. If you already have an account, try signing in.",
        )
        self.assertNotIn("email", response.data)

    @patch("accounts.serializers.send_verification_email")
    def test_register_normalizes_email_to_lowercase(self, mock_send):
        payload = {"email": "Owner@Example.Com", "password": "StrongPass#2026"}
        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "owner@example.com")

    def test_register_rejects_weak_password(self):
        payload = {"email": "owner@example.com", "password": "12345678"}
        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    # -------- Login --------

    def test_login_success_with_verified_user(self):
        self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        payload = {"email": "owner@example.com", "password": "StrongPass#2026"}

        response = self.client.post(self.login_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assert_user_identity_payload(
            response.data["user"],
            expected_email=payload["email"],
            expected_requires_setup=True,
        )
        self.assertIn("access", response.data["tokens"])

    def test_login_success_with_completed_profile(self):
        self.create_completed_user(email="owner@example.com", password="StrongPass#2026")
        payload = {"email": "owner@example.com", "password": "StrongPass#2026"}

        response = self.client.post(self.login_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["user"]["requires_profile_setup"])
        self.assertTrue(response.data["user"]["is_profile_completed"])
        self.assertEqual(response.data["user"]["identify_tag"], "quangminh#ABC123")

    def test_login_rejects_unverified_email(self):
        User.objects.create_user(email="owner@example.com", password="StrongPass#2026")
        payload = {"email": "owner@example.com", "password": "StrongPass#2026"}

        response = self.client.post(self.login_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["error_code"], "EMAIL_NOT_VERIFIED")

    def test_login_wrong_password_unverified_no_enumeration(self):
        User.objects.create_user(email="owner@example.com", password="StrongPass#2026")
        payload = {"email": "owner@example.com", "password": "WrongPass#2026"}

        response = self.client.post(self.login_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn("error_code", response.data)

    def test_login_rejects_wrong_password(self):
        self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        payload = {"email": "owner@example.com", "password": "WrongPass#2026"}

        response = self.client.post(self.login_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_accepts_case_insensitive_email(self):
        self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        payload = {"email": "OWNER@EXAMPLE.COM", "password": "StrongPass#2026"}

        response = self.client.post(self.login_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["email"], "owner@example.com")

    def test_admin_login_bypasses_email_verification(self):
        admin_user = User.objects.create_superuser(email="admin@example.com", password="StrongPass#2026")
        self.assertFalse(admin_user.email_verified)
        payload = {"email": "admin@example.com", "password": "StrongPass#2026"}

        response = self.client.post(self.login_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["user"]["requires_profile_setup"])

    # -------- Verify Email --------

    def test_verify_email_success(self):
        user = User.objects.create_user(email="owner@example.com", password="StrongPass#2026")
        token = generate_email_verification_token(user)

        response = self.client.get(f"{self.verify_email_url}?token={token}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("tokens", response.data)
        self.assertIn("user", response.data)

        user.refresh_from_db()
        self.assertTrue(user.email_verified)
        self.assertIsNotNone(user.email_verified_at)

    def test_verify_email_expired_token(self):
        user = User.objects.create_user(email="owner@example.com", password="StrongPass#2026")
        token = generate_email_verification_token(user)

        with patch("accounts.services.settings.EMAIL_VERIFICATION_MAX_AGE_SECONDS", 0):
            response = self.client.get(f"{self.verify_email_url}?token={token}")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error_code"], "INVALID_OR_EXPIRED_TOKEN")

    def test_verify_email_invalid_token(self):
        response = self.client.get(f"{self.verify_email_url}?token=garbage-token")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error_code"], "INVALID_OR_EXPIRED_TOKEN")

    def test_verify_email_idempotent(self):
        user = User.objects.create_user(email="owner@example.com", password="StrongPass#2026")
        token = generate_email_verification_token(user)

        response1 = self.client.get(f"{self.verify_email_url}?token={token}")
        response2 = self.client.get(f"{self.verify_email_url}?token={token}")

        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        self.assertEqual(response2.status_code, status.HTTP_200_OK)

    def test_verify_email_missing_token(self):
        response = self.client.get(self.verify_email_url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error_code"], "INVALID_OR_EXPIRED_TOKEN")

    # -------- Resend Verification --------

    @patch("accounts.serializers.send_verification_email")
    def test_resend_verification_success(self, mock_send):
        User.objects.create_user(email="owner@example.com", password="StrongPass#2026")

        response = self.client.post(
            self.resend_verification_url, {"email": "owner@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_send.assert_called_once()

    @patch("accounts.serializers.send_verification_email")
    def test_resend_nonexistent_email_returns_success(self, mock_send):
        response = self.client.post(
            self.resend_verification_url, {"email": "nobody@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_send.assert_not_called()

    @patch("accounts.serializers.send_verification_email")
    def test_resend_already_verified_returns_success_no_email(self, mock_send):
        self.create_verified_user(email="owner@example.com", password="StrongPass#2026")

        response = self.client.post(
            self.resend_verification_url, {"email": "owner@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_send.assert_not_called()

    # -------- Me --------

    def test_me_requires_access_token(self):
        response = self.client.get(self.me_url, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_success_returns_identity_payload(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.get(self.me_url, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assert_user_identity_payload(
            response.data["user"],
            expected_email=user.email,
            expected_requires_setup=True,
        )

    def test_me_rejects_refresh_token_in_auth_header(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['refresh']}")

        response = self.client.get(self.me_url, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # -------- Profile Setup --------

    def test_profile_setup_success(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.post(
            self.profile_setup_url,
            {"first_name": " Quang ", "last_name": " Minh ", "identify_name": "QuangMinh"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["display_name"], "Quang Minh")
        self.assertEqual(response.data["user"]["identify_name"], "quangminh")
        self.assertRegex(response.data["user"]["identify_code"], r"^[A-Z0-9]{6}$")
        self.assertEqual(
            response.data["user"]["identify_tag"],
            f"quangminh#{response.data['user']['identify_code']}",
        )
        self.assertFalse(response.data["user"]["requires_profile_setup"])

        user.refresh_from_db()
        self.assertTrue(user.is_profile_completed)
        self.assertEqual(user.display_name, "Quang Minh")
        self.assertIsNotNone(user.profile_completed_at)

    def test_profile_setup_rejects_invalid_identify_name(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.post(
            self.profile_setup_url,
            {"first_name": "Quang", "last_name": "Minh", "identify_name": "quang_123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error_code"], "INVALID_IDENTIFY_NAME")
        self.assertIn("detail", response.data)

    def test_profile_setup_rejects_invalid_human_name(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.post(
            self.profile_setup_url,
            {"first_name": "Quang123", "last_name": "Minh", "identify_name": "quangminh"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error_code"], "INVALID_FIRST_NAME")
        self.assertIn("detail", response.data)

    def test_profile_setup_rejects_when_already_completed(self):
        user = self.create_completed_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.post(
            self.profile_setup_url,
            {"first_name": "Quang", "last_name": "Minh", "identify_name": "newname"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["error_code"], "PROFILE_ALREADY_COMPLETED")

    def test_profile_setup_retries_identify_code_collision(self):
        self.create_completed_user(email="existing@example.com", password="StrongPass#2026", identify_code="AAAAAA")
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        with patch("accounts.services.generate_identify_code", side_effect=["AAAAAA", "BBBBBB"]):
            response = self.client.post(
                self.profile_setup_url,
                {"first_name": "Quang", "last_name": "Minh", "identify_name": "quangminh"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["identify_code"], "BBBBBB")

    def test_profile_setup_returns_identify_code_generation_failed(self):
        self.create_completed_user(email="existing@example.com", password="StrongPass#2026", identify_code="AAAAAA")
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        with patch("accounts.services.generate_identify_code", return_value="AAAAAA"):
            response = self.client.post(
                self.profile_setup_url,
                {"first_name": "Quang", "last_name": "Minh", "identify_name": "quangminh"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.data["error_code"], "IDENTIFY_CODE_GENERATION_FAILED")

    def test_profile_setup_rejects_admin_user(self):
        admin_user = User.objects.create_superuser(email="admin@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.post(
            self.profile_setup_url,
            {"first_name": "Admin", "last_name": "User", "identify_name": "adminuser"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["error_code"], "PROFILE_SETUP_NOT_REQUIRED")

    # -------- Profile Name Update --------

    def test_profile_name_update_success(self):
        user = self.create_completed_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.patch(
            self.profile_name_url,
            {"first_name": "Pham", "last_name": "Quang"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["display_name"], "Pham Quang")
        self.assertEqual(response.data["user"]["identify_name"], "quangminh")
        self.assertEqual(response.data["user"]["identify_code"], "ABC123")
        self.assertEqual(response.data["user"]["identify_tag"], "quangminh#ABC123")

    def test_profile_name_update_rejects_pending_user(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.patch(
            self.profile_name_url,
            {"first_name": "Pham", "last_name": "Quang"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["error_code"], "PROFILE_SETUP_REQUIRED")

    def test_profile_name_update_rejects_invalid_last_name_with_error_code(self):
        user = self.create_completed_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.patch(
            self.profile_name_url,
            {"first_name": "Pham", "last_name": "Quang123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error_code"], "INVALID_LAST_NAME")

    # -------- Refresh --------

    def test_refresh_success_returns_new_access_and_refresh(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)

        response = self.client.post(self.refresh_url, {"refresh": tokens["refresh"]}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertNotEqual(response.data["refresh"], tokens["refresh"])

    def test_refresh_invalid_token_returns_401(self):
        response = self.client.post(self.refresh_url, {"refresh": "invalid-token"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "token_not_valid")

    def test_refresh_missing_field_returns_400(self):
        response = self.client.post(self.refresh_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("refresh", response.data)

    # -------- Logout --------

    def test_logout_requires_access_token(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)

        response = self.client.post(self.logout_url, {"refresh": tokens["refresh"]}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_success_blacklists_refresh(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.post(self.logout_url, {"refresh": tokens["refresh"]}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["detail"], "Logout successful.")

        refresh_response = self.client.post(self.refresh_url, {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_is_idempotent_for_blacklisted_or_invalid_refresh(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        first_response = self.client.post(self.logout_url, {"refresh": tokens["refresh"]}, format="json")
        second_response = self.client.post(self.logout_url, {"refresh": tokens["refresh"]}, format="json")
        invalid_response = self.client.post(self.logout_url, {"refresh": "invalid-token"}, format="json")

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(invalid_response.status_code, status.HTTP_200_OK)

    def test_logout_rejects_refresh_of_another_user_with_403(self):
        owner_user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        other_user = self.create_verified_user(email="other@example.com", password="StrongPass#2026")
        owner_tokens = self.issue_tokens_for_user(owner_user)
        other_tokens = self.issue_tokens_for_user(other_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {owner_tokens['access']}")

        response = self.client.post(self.logout_url, {"refresh": other_tokens["refresh"]}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_logout_missing_refresh_returns_400(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.post(self.logout_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("refresh", response.data)
