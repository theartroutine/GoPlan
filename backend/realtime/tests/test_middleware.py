from __future__ import annotations

from datetime import timedelta
from urllib.parse import urlencode

from channels.db import database_sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings
from django.urls import re_path
from django.utils import timezone

from accounts.tokens import AccessToken
from realtime.consumers import ConnectionConsumer
from realtime.middleware import WebSocketJWTMiddleware

User = get_user_model()

TEST_CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}


def _build_application():
    """Build a minimal ASGI application for testing (no OriginValidator)."""
    return WebSocketJWTMiddleware(
        URLRouter([
            re_path(r"ws/connect$", ConnectionConsumer.as_asgi()),
        ])
    )


def _make_communicator(token=None):
    """Create a WebsocketCommunicator with optional token query param."""
    path = "ws/connect"
    if token is not None:
        path += f"?{urlencode({'token': token})}"
    return WebsocketCommunicator(_build_application(), path)


@database_sync_to_async
def _create_user(email="test@example.com", password="testpass123!", **kwargs):
    user = User.objects.create_user(email=email, password=password)
    user.email_verified = True
    user.email_verified_at = timezone.now()
    for attr, value in kwargs.items():
        setattr(user, attr, value)
    user.save()
    return user


def _issue_access_token(user):
    return str(AccessToken.for_user(user))


def _issue_expired_access_token(user):
    """Issue an access token that is already expired."""
    token = AccessToken.for_user(user)
    # Override exp to the past
    token.set_exp(from_time=timezone.now() - timedelta(hours=1))
    return str(token)


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class WebSocketAuthMiddlewareTests(TransactionTestCase):
    """Tests for WebSocketJWTMiddleware.

    Each unauthorized test asserts the full accept-then-close contract:
    (1) connect accepted, (2) receive auth_error message, (3) close with correct code.

    Uses TransactionTestCase because Channels tests are async and
    database_sync_to_async runs in a different thread that cannot see
    TestCase's uncommitted transaction.
    """

    async def test_valid_token_connects(self):
        user = await _create_user()
        token = _issue_access_token(user)

        communicator = _make_communicator(token=token)
        connected, _ = await communicator.connect()

        self.assertTrue(connected)
        await communicator.disconnect()

    async def test_missing_token_closes_4001(self):
        communicator = _make_communicator(token=None)
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

    async def test_expired_token_closes_4002(self):
        user = await _create_user(email="expired@example.com")
        token = _issue_expired_access_token(user)

        communicator = _make_communicator(token=token)
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
        token = _issue_access_token(user)

        # Simulate password change — increment auth_version
        @database_sync_to_async
        def increment_auth_version():
            user.auth_version += 1
            user.save(update_fields=["auth_version"])

        await increment_auth_version()

        communicator = _make_communicator(token=token)
        connected, _ = await communicator.connect()

        self.assertTrue(connected)

        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "auth_error")
        self.assertEqual(response["code"], "auth_failed")

        close = await communicator.receive_output()
        self.assertEqual(close["type"], "websocket.close")
        self.assertEqual(close["code"], 4001)

    async def test_invalid_token_closes_4001(self):
        communicator = _make_communicator(token="not-a-valid-jwt-at-all")
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
        import jwt as pyjwt

        # Build a JWT with exp="abc" — SimpleJWT will reject it, then
        # _classify_token_error must handle the non-numeric exp gracefully.
        malformed_token = pyjwt.encode(
            {"exp": "abc", "token_type": "access"},
            "wrong-secret",
            algorithm="HS256",
        )

        communicator = _make_communicator(token=malformed_token)
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
        token = _issue_access_token(user)

        # Delete the user after issuing token
        await database_sync_to_async(user.delete)()

        communicator = _make_communicator(token=token)
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
        token = _issue_access_token(user)

        communicator = _make_communicator(token=token)
        connected, _ = await communicator.connect()

        self.assertTrue(connected)

        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "auth_error")
        self.assertEqual(response["code"], "auth_failed")

        close = await communicator.receive_output()
        self.assertEqual(close["type"], "websocket.close")
        self.assertEqual(close["code"], 4001)
