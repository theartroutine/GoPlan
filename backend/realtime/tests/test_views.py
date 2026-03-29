from __future__ import annotations

from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from realtime.services import authenticate_ws_ticket
from test_helpers import create_verified_user

WS_TICKET_URL = "/api/realtime/ws-ticket"


def _auth_header(user):
    token = AccessToken.for_user(user)
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


class WebSocketTicketViewTests(APITestCase):

    def test_issue_ws_ticket_returns_ticket(self):
        user = create_verified_user()

        response = self.client.post(WS_TICKET_URL, **_auth_header(user))

        self.assertEqual(response.status_code, 200)
        self.assertIn("ticket", response.data)

        authenticated_user, auth_error = authenticate_ws_ticket(response.data["ticket"])
        self.assertIsNone(auth_error)
        self.assertEqual(authenticated_user, user)

    def test_issue_ws_ticket_requires_auth(self):
        response = self.client.post(WS_TICKET_URL)
        self.assertEqual(response.status_code, 401)
