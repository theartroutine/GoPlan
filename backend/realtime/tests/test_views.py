from __future__ import annotations

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from realtime.services import authenticate_ws_ticket

User = get_user_model()

WS_TICKET_URL = "/api/realtime/ws-ticket"


def _create_verified_user(email="user@example.com", password="testpass123!"):
    user = User.objects.create_user(email=email, password=password)
    user.email_verified = True
    user.email_verified_at = timezone.now()
    user.save(update_fields=["email_verified", "email_verified_at"])
    return user


def _auth_header(user):
    token = AccessToken.for_user(user)
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


class WebSocketTicketViewTests(APITestCase):

    def test_issue_ws_ticket_returns_ticket(self):
        user = _create_verified_user()

        response = self.client.post(WS_TICKET_URL, **_auth_header(user))

        self.assertEqual(response.status_code, 200)
        self.assertIn("ticket", response.data)

        authenticated_user, auth_error = authenticate_ws_ticket(response.data["ticket"])
        self.assertIsNone(auth_error)
        self.assertEqual(authenticated_user, user)

    def test_issue_ws_ticket_requires_auth(self):
        response = self.client.post(WS_TICKET_URL)
        self.assertEqual(response.status_code, 401)
