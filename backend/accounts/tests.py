from __future__ import annotations

import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.test import APITestCase
from accounts.tokens import RefreshToken

from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from accounts.models import EmailVerificationToken
from accounts.services import generate_email_verification_token
from test_helpers import (
    create_completed_user as build_completed_user,
    create_verified_user as build_verified_user,
)

User = get_user_model()


class AuthAPITestCase(APITestCase):
    register_url = "/api/auth/register"
    login_url = "/api/auth/login"
    verify_email_url = "/api/auth/verify-email"
    resend_verification_url = "/api/auth/resend-verification"
    me_url = "/api/auth/me"
    profile_setup_url = "/api/auth/profile/setup"
    profile_name_url = "/api/auth/profile/name"
    password_reset_request_url = "/api/auth/password-reset/request"
    password_reset_confirm_url = "/api/auth/password-reset/confirm"
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
        return build_verified_user(email=email, password=password)

    def create_completed_user(self, email: str, password: str, identify_code: str = "ABC123"):
        return build_completed_user(
            email=email,
            password=password,
            identify_name="quangminh",
            identify_code=identify_code,
            first_name="Quang",
            last_name="Minh",
            display_name="Quang Minh",
        )

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

    def assert_invalid_reset_link_error(self, response):
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Invalid or expired reset link.")
        self.assertEqual(response.data["error_code"], "INVALID_OR_EXPIRED_TOKEN")

    # -------- Register --------

    @patch("accounts.serializers.send_verification_email")
    def test_register_success_returns_generic_detail(self, mock_send):
        payload = {"email": "owner@example.com", "password": "StrongPass#2026"}
        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(User.objects.count(), 1)
        self.assertIn("detail", response.data)
        self.assertNotIn("email", response.data)
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

    @patch("accounts.serializers.send_verification_email")
    def test_register_duplicate_email_matches_success_contract(self, mock_send):
        User.objects.create_user(email="owner@example.com", password="StrongPass#2026")
        duplicate_payload = {"email": "OWNER@EXAMPLE.COM", "password": "StrongPass#2026"}
        fresh_payload = {"email": "fresh@example.com", "password": "StrongPass#2026"}

        duplicate_response = self.client.post(self.register_url, duplicate_payload, format="json")
        fresh_response = self.client.post(self.register_url, fresh_payload, format="json")

        self.assertEqual(duplicate_response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(fresh_response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(duplicate_response.data, fresh_response.data)
        self.assertNotIn("email", duplicate_response.data)

    @patch("accounts.serializers.send_verification_email")
    def test_register_normalizes_email_to_lowercase(self, mock_send):
        payload = {"email": "Owner@Example.Com", "password": "StrongPass#2026"}
        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(User.objects.get().email, "owner@example.com")

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

        response = self.client.post(self.verify_email_url, {"token": token}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("tokens", response.data)
        self.assertIn("user", response.data)
        self.assertTrue(response.data["user"]["email_verified"])

        user.refresh_from_db()
        self.assertTrue(user.email_verified)
        self.assertIsNotNone(user.email_verified_at)

    def test_verify_email_expired_token(self):
        user = User.objects.create_user(email="owner@example.com", password="StrongPass#2026")
        token = generate_email_verification_token(user)

        with patch("accounts.services.settings.EMAIL_VERIFICATION_MAX_AGE_SECONDS", 0):
            response = self.client.post(self.verify_email_url, {"token": token}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error_code"], "INVALID_OR_EXPIRED_TOKEN")

    def test_verify_email_invalid_token(self):
        response = self.client.post(self.verify_email_url, {"token": "garbage-token"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error_code"], "INVALID_OR_EXPIRED_TOKEN")

    def test_verify_email_token_is_single_use(self):
        user = User.objects.create_user(email="owner@example.com", password="StrongPass#2026")
        token = generate_email_verification_token(user)

        response1 = self.client.post(self.verify_email_url, {"token": token}, format="json")
        response2 = self.client.post(self.verify_email_url, {"token": token}, format="json")

        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response2.data["error_code"], "INVALID_OR_EXPIRED_TOKEN")
        self.assertTrue(
            EmailVerificationToken.objects.filter(user=user, used_at__isnull=False).exists()
        )

    def test_verify_email_missing_token(self):
        response = self.client.post(self.verify_email_url, {}, format="json")

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

    def test_profile_setup_rejects_first_name_with_spaces(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.post(
            self.profile_setup_url,
            {"first_name": "Quang Minh", "last_name": "Pham", "identify_name": "quangminh"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error_code"], "INVALID_FIRST_NAME")

    def test_profile_setup_rejects_last_name_with_spaces(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.post(
            self.profile_setup_url,
            {"first_name": "Quang", "last_name": "Minh Quang", "identify_name": "quangminh"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error_code"], "INVALID_LAST_NAME")

    def test_profile_setup_accepts_hyphenated_name(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.post(
            self.profile_setup_url,
            {"first_name": "Jean-Pierre", "last_name": "Dupont", "identify_name": "jeanpierre"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["display_name"], "Jean-Pierre Dupont")

    def test_profile_setup_accepts_apostrophe_name(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.post(
            self.profile_setup_url,
            {"first_name": "O'Brien", "last_name": "Smith", "identify_name": "obrien"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["display_name"], "O'Brien Smith")

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

    def test_user_allows_duplicate_identify_name_with_different_identify_codes(self):
        first_user = self.create_completed_user(
            email="first@example.com",
            password="StrongPass#2026",
            identify_code="ABC123",
        )
        second_user = self.create_completed_user(
            email="second@example.com",
            password="StrongPass#2026",
            identify_code="DEF456",
        )

        self.assertEqual(first_user.identify_name, "quangminh")
        self.assertEqual(second_user.identify_name, "quangminh")
        self.assertEqual(User.objects.filter(identify_name="quangminh").count(), 2)

    def test_user_rejects_duplicate_identify_code_even_with_different_identify_names(self):
        self.create_completed_user(
            email="first@example.com",
            password="StrongPass#2026",
            identify_code="ABC123",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                build_completed_user(
                    email="second@example.com",
                    password="StrongPass#2026",
                    identify_name="anhnhi",
                    identify_code="ABC123",
                    first_name="Anh",
                    last_name="Nhi",
                    display_name="Anh Nhi",
                )

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

    def test_profile_name_update_rejects_name_with_spaces(self):
        user = self.create_completed_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.patch(
            self.profile_name_url,
            {"first_name": "Pham Quang", "last_name": "Minh"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error_code"], "INVALID_FIRST_NAME")

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

    # -------- Auth Version / Session Revocation --------

    def test_auth_version_valid_token_accepted(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.get(self.me_url, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_auth_version_increment_rejects_old_access_token(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)

        user.auth_version += 1
        user.save(update_fields=["auth_version", "updated_at"])

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        response = self.client.get(self.me_url, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_auth_version_increment_new_token_works(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")

        user.auth_version += 1
        user.save(update_fields=["auth_version", "updated_at"])

        tokens = self.issue_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        response = self.client.get(self.me_url, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_blacklist_all_refresh_tokens_rejects_old_refresh(self):
        from accounts.services import blacklist_all_user_refresh_tokens

        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        tokens = self.issue_tokens_for_user(user)

        blacklist_all_user_refresh_tokens(user)

        response = self.client.post(self.refresh_url, {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # -------- Password Reset Request --------

    @staticmethod
    def make_reset_uid(user):
        return urlsafe_base64_encode(force_bytes(str(user.pk)))

    @patch("accounts.serializers.send_password_reset_email")
    def test_password_reset_request_success_for_verified_user(self, mock_send):
        self.create_verified_user(email="owner@example.com", password="StrongPass#2026")

        response = self.client.post(
            self.password_reset_request_url, {"email": "owner@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("detail", response.data)
        mock_send.assert_called_once()

    @patch("accounts.serializers.send_password_reset_email")
    def test_password_reset_request_nonexistent_email_returns_200(self, mock_send):
        response = self.client.post(
            self.password_reset_request_url, {"email": "nobody@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_send.assert_not_called()

    @patch("accounts.serializers.send_password_reset_email")
    def test_password_reset_request_admin_user_returns_200_no_email(self, mock_send):
        User.objects.create_superuser(email="admin@example.com", password="StrongPass#2026")

        response = self.client.post(
            self.password_reset_request_url, {"email": "admin@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_send.assert_not_called()

    @patch("accounts.serializers.send_password_reset_email")
    def test_password_reset_request_inactive_user_returns_200_no_email(self, mock_send):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        user.is_active = False
        user.save(update_fields=["is_active", "updated_at"])

        response = self.client.post(
            self.password_reset_request_url, {"email": "owner@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_send.assert_not_called()

    @patch("accounts.serializers.send_password_reset_email")
    def test_password_reset_request_unverified_user_returns_200_no_email(self, mock_send):
        User.objects.create_user(email="owner@example.com", password="StrongPass#2026")

        response = self.client.post(
            self.password_reset_request_url, {"email": "owner@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_send.assert_not_called()

    # -------- Password Reset Confirm --------

    def test_password_reset_confirm_success(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        uid = self.make_reset_uid(user)
        token = default_token_generator.make_token(user)

        response = self.client.post(
            self.password_reset_confirm_url,
            {"uid": uid, "token": token, "password": "NewStrongPass#2026"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("detail", response.data)

        user.refresh_from_db()
        self.assertTrue(user.check_password("NewStrongPass#2026"))
        self.assertFalse(user.check_password("StrongPass#2026"))

    def test_password_reset_confirm_reused_token_rejected(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        uid = self.make_reset_uid(user)
        token = default_token_generator.make_token(user)

        # First reset succeeds
        self.client.post(
            self.password_reset_confirm_url,
            {"uid": uid, "token": token, "password": "NewStrongPass#2026"},
            format="json",
        )

        # Second reset with same token fails (password hash changed)
        response = self.client.post(
            self.password_reset_confirm_url,
            {"uid": uid, "token": token, "password": "AnotherPass#2026"},
            format="json",
        )

        self.assert_invalid_reset_link_error(response)

    def test_password_reset_confirm_invalid_token(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        uid = self.make_reset_uid(user)

        response = self.client.post(
            self.password_reset_confirm_url,
            {"uid": uid, "token": "invalid-token", "password": "NewStrongPass#2026"},
            format="json",
        )

        self.assert_invalid_reset_link_error(response)

    def test_password_reset_confirm_invalid_uid(self):
        response = self.client.post(
            self.password_reset_confirm_url,
            {"uid": "invaliduid", "token": "sometoken", "password": "NewStrongPass#2026"},
            format="json",
        )

        self.assert_invalid_reset_link_error(response)

    def test_password_reset_confirm_weak_password(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        uid = self.make_reset_uid(user)
        token = default_token_generator.make_token(user)

        response = self.client.post(
            self.password_reset_confirm_url,
            {"uid": uid, "token": token, "password": "12345678"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_password_reset_confirm_revokes_sessions(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        old_tokens = self.issue_tokens_for_user(user)
        uid = self.make_reset_uid(user)
        token = default_token_generator.make_token(user)

        self.client.post(
            self.password_reset_confirm_url,
            {"uid": uid, "token": token, "password": "NewStrongPass#2026"},
            format="json",
        )

        # Old access token rejected (auth_version mismatch)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {old_tokens['access']}")
        me_response = self.client.get(self.me_url, format="json")
        self.assertEqual(me_response.status_code, status.HTTP_401_UNAUTHORIZED)

        # Old refresh token blacklisted
        self.client.credentials()
        refresh_response = self.client.post(
            self.refresh_url, {"refresh": old_tokens["refresh"]}, format="json"
        )
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_password_reset_confirm_rejects_superuser(self):
        admin = User.objects.create_superuser(email="admin@example.com", password="StrongPass#2026")
        uid = self.make_reset_uid(admin)
        token = default_token_generator.make_token(admin)

        response = self.client.post(
            self.password_reset_confirm_url,
            {"uid": uid, "token": token, "password": "NewStrongPass#2026"},
            format="json",
        )

        self.assert_invalid_reset_link_error(response)

    def test_password_reset_confirm_rejects_staff_user(self):
        staff = User.objects.create_user(email="staff@example.com", password="StrongPass#2026")
        staff.is_staff = True
        staff.save(update_fields=["is_staff", "updated_at"])
        uid = self.make_reset_uid(staff)
        token = default_token_generator.make_token(staff)

        response = self.client.post(
            self.password_reset_confirm_url,
            {"uid": uid, "token": token, "password": "NewStrongPass#2026"},
            format="json",
        )

        self.assert_invalid_reset_link_error(response)

    def test_password_reset_confirm_rejects_password_similar_to_email(self):
        user = self.create_verified_user(email="owner@example.com", password="StrongPass#2026")
        uid = self.make_reset_uid(user)
        token = default_token_generator.make_token(user)

        response = self.client.post(
            self.password_reset_confirm_url,
            {"uid": uid, "token": token, "password": "owner@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
