from __future__ import annotations

from datetime import timedelta

import jwt as pyjwt
from channels.db import database_sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings
from django.urls import re_path
from django.utils import timezone

from realtime.consumers import RealtimeConsumer
from realtime.middleware import WebSocketAuthMiddleware
from realtime.services import issue_ws_ticket

User = get_user_model()

TEST_CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}


def _build_application():
    """Build a minimal ASGI application for testing (no OriginValidator)."""
    return WebSocketAuthMiddleware(
        URLRouter([
            re_path(r"ws/realtime$", RealtimeConsumer.as_asgi()),
        ])
    )


def _make_communicator(ticket=None):
    """Create a WebsocketCommunicator with optional WebSocket ticket."""
    subprotocols = None
    if ticket is not None:
        subprotocols = [settings.WS_SUBPROTOCOL, ticket]
    return WebsocketCommunicator(
        _build_application(),
        "ws/realtime",
        subprotocols=subprotocols,
    )


@database_sync_to_async
def _create_user(email="test@example.com", password="testpass123!", **kwargs):
    user = User.objects.create_user(email=email, password=password)
    user.email_verified = True
    user.email_verified_at = timezone.now()
    for attr, value in kwargs.items():
        setattr(user, attr, value)
    user.save()
    return user


def _issue_ws_ticket(user):
    return issue_ws_ticket(user)


def _issue_expired_ws_ticket(user):
    """Issue a WebSocket ticket that is already expired."""
    now = timezone.now()
    return pyjwt.encode(
        {
            "sub": str(user.id),
            "auth_version": user.auth_version,
            "scope": "realtime:connect",
            "iat": int((now - timedelta(hours=1)).timestamp()),
            "exp": int((now - timedelta(minutes=1)).timestamp()),
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class WebSocketAuthMiddlewareTests(TransactionTestCase):
    """Tests for WebSocketAuthMiddleware.

    Each unauthorized test asserts the full accept-then-close contract:
    (1) connect accepted, (2) receive auth_error message, (3) close with correct code.

    Uses TransactionTestCase because Channels tests are async and
    database_sync_to_async runs in a different thread that cannot see
    TestCase's uncommitted transaction.
    """

    async def test_valid_ticket_connects(self):
        user = await _create_user()
        ticket = _issue_ws_ticket(user)

        communicator = _make_communicator(ticket=ticket)
        connected, _ = await communicator.connect()

        self.assertTrue(connected)
        await communicator.disconnect()

    async def test_missing_ticket_closes_4001(self):
        communicator = _make_communicator(ticket=None)
        connected, _ = await communicator.connect()

        # (1) Connection accepted (for reliable close code delivery)
        self.assertTrue(connected)

        # (2) Receive auth_error message
        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "auth_error")
        self.assertEqual(response["code"], "auth_failed")

        # (3) Close with 4001
        close = await communicator.receive_output()
        self.assertEqual(close["type"], "websocket.close")
        self.assertEqual(close["code"], 4001)

    async def test_expired_ticket_closes_4002(self):
        user = await _create_user(email="expired@example.com")
        ticket = _issue_expired_ws_ticket(user)

        communicator = _make_communicator(ticket=ticket)
        connected, _ = await communicator.connect()

        self.assertTrue(connected)

        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "auth_error")
        self.assertEqual(response["code"], "token_expired")

        close = await communicator.receive_output()
        self.assertEqual(close["type"], "websocket.close")
        self.assertEqual(close["code"], 4002)

    async def test_revoked_auth_version_closes_4001(self):
        user = await _create_user(email="revoked@example.com")
        ticket = _issue_ws_ticket(user)

        # Simulate password change — increment auth_version
        @database_sync_to_async
        def increment_auth_version():
            user.auth_version += 1
            user.save(update_fields=["auth_version"])

        await increment_auth_version()

        communicator = _make_communicator(ticket=ticket)
        connected, _ = await communicator.connect()

        self.assertTrue(connected)

        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "auth_error")
        self.assertEqual(response["code"], "auth_failed")

        close = await communicator.receive_output()
        self.assertEqual(close["type"], "websocket.close")
        self.assertEqual(close["code"], 4001)

    async def test_invalid_ticket_closes_4001(self):
        communicator = _make_communicator(ticket="not-a-valid-jwt-at-all")
        connected, _ = await communicator.connect()

        self.assertTrue(connected)

        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "auth_error")
        self.assertEqual(response["code"], "auth_failed")

        close = await communicator.receive_output()
        self.assertEqual(close["type"], "websocket.close")
        self.assertEqual(close["code"], 4001)

    async def test_malformed_exp_claim_closes_4001(self):
        """Crafted JWT with non-numeric exp must not crash the middleware."""
        # Build a JWT with exp="abc" — ticket validation must fail cleanly.
        malformed_token = pyjwt.encode(
            {
                "sub": "test-user",
                "auth_version": 1,
                "scope": "realtime:connect",
                "exp": "abc",
            },
            settings.SECRET_KEY,
            algorithm="HS256",
        )

        communicator = _make_communicator(ticket=malformed_token)
        connected, _ = await communicator.connect()

        self.assertTrue(connected)

        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "auth_error")
        self.assertEqual(response["code"], "auth_failed")

        close = await communicator.receive_output()
        self.assertEqual(close["type"], "websocket.close")
        self.assertEqual(close["code"], 4001)

    async def test_nonexistent_user_closes_4001(self):
        user = await _create_user(email="deleted@example.com")
        ticket = _issue_ws_ticket(user)

        # Delete the user after issuing token
        await database_sync_to_async(user.delete)()

        communicator = _make_communicator(ticket=ticket)
        connected, _ = await communicator.connect()

        self.assertTrue(connected)

        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "auth_error")
        self.assertEqual(response["code"], "auth_failed")

        close = await communicator.receive_output()
        self.assertEqual(close["type"], "websocket.close")
        self.assertEqual(close["code"], 4001)

    async def test_inactive_user_closes_4001(self):
        user = await _create_user(email="inactive@example.com", is_active=False)
        ticket = _issue_ws_ticket(user)

        communicator = _make_communicator(ticket=ticket)
        connected, _ = await communicator.connect()

        self.assertTrue(connected)

        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "auth_error")
        self.assertEqual(response["code"], "auth_failed")

        close = await communicator.receive_output()
        self.assertEqual(close["type"], "websocket.close")
        self.assertEqual(close["code"], 4001)
