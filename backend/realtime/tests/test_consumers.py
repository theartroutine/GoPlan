from __future__ import annotations

from urllib.parse import urlencode

from channels.db import database_sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings
from django.urls import re_path
from django.utils import timezone

from accounts.tokens import AccessToken
from realtime.consumers import RealtimeConsumer
from realtime.middleware import WebSocketJWTMiddleware

User = get_user_model()

TEST_CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}


def _build_application():
    return WebSocketJWTMiddleware(
        URLRouter([
            re_path(r"ws/realtime$", RealtimeConsumer.as_asgi()),
        ])
    )


@database_sync_to_async
def _create_user(email="consumer@example.com", password="testpass123!"):
    user = User.objects.create_user(email=email, password=password)
    user.email_verified = True
    user.email_verified_at = timezone.now()
    user.save()
    return user


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class RealtimeConsumerTests(TransactionTestCase):

    async def test_authenticated_connect(self):
        user = await _create_user()
        token = str(AccessToken.for_user(user))
        path = f"ws/realtime?{urlencode({'token': token})}"

        communicator = WebsocketCommunicator(_build_application(), path)
        connected, _ = await communicator.connect()

        self.assertTrue(connected)

        # No auth_error message should be sent for authenticated connections
        self.assertTrue(await communicator.receive_nothing(timeout=0.1))

        await communicator.disconnect()

    async def test_ping_pong(self):
        user = await _create_user(email="pingpong@example.com")
        token = str(AccessToken.for_user(user))
        path = f"ws/realtime?{urlencode({'token': token})}"

        communicator = WebsocketCommunicator(_build_application(), path)
        await communicator.connect()

        await communicator.send_json_to({"type": "ping"})
        response = await communicator.receive_json_from()

        self.assertEqual(response, {"type": "pong"})

        await communicator.disconnect()

    async def test_disconnect_clean(self):
        user = await _create_user(email="disconnect@example.com")
        token = str(AccessToken.for_user(user))
        path = f"ws/realtime?{urlencode({'token': token})}"

        communicator = WebsocketCommunicator(_build_application(), path)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Disconnect should not raise
        await communicator.disconnect()
