from __future__ import annotations

from urllib.parse import urlencode

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
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
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}


def _build_application():
    return WebSocketJWTMiddleware(
        URLRouter([
            re_path(r"ws/realtime$", RealtimeConsumer.as_asgi()),
        ])
    )


@database_sync_to_async
def _create_user(email="notif@example.com", password="testpass123!"):
    user = User.objects.create_user(email=email, password=password)
    user.email_verified = True
    user.email_verified_at = timezone.now()
    user.save()
    return user


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class NotificationConsumerTests(TransactionTestCase):

    async def test_authenticated_user_joins_notification_group(self):
        user = await _create_user()
        token = str(AccessToken.for_user(user))
        path = f"ws/realtime?{urlencode({'token': token})}"

        communicator = WebsocketCommunicator(_build_application(), path)
        connected, _ = await communicator.connect()

        self.assertTrue(connected)

        # Send a message to the notification group — should be received
        channel_layer = get_channel_layer()
        test_message = {
            "type": "notification",
            "event": "created",
            "notification": {"id": "test-123"},
        }
        await channel_layer.group_send(
            f"notifications_{user.id}",
            {"type": "notification_push", "data": test_message},
        )

        response = await communicator.receive_json_from(timeout=1)
        self.assertEqual(response["type"], "notification")
        self.assertEqual(response["event"], "created")

        await communicator.disconnect()

    async def test_receives_notification_push(self):
        user = await _create_user(email="push@example.com")
        token = str(AccessToken.for_user(user))
        path = f"ws/realtime?{urlencode({'token': token})}"

        communicator = WebsocketCommunicator(_build_application(), path)
        await communicator.connect()

        channel_layer = get_channel_layer()
        ws_message = {
            "type": "notification",
            "event": "created",
            "notification": {
                "id": "abc-123",
                "notification_type": "FRIEND_REQUEST",
                "actor": {
                    "id": "actor-id",
                    "display_name": "Test User",
                    "identify_tag": "testuser#ABC123",
                },
                "payload": {},
                "is_read": False,
                "read_at": None,
                "created_at": "2026-03-13T09:00:00+07:00",
            },
        }
        await channel_layer.group_send(
            f"notifications_{user.id}",
            {"type": "notification_push", "data": ws_message},
        )

        response = await communicator.receive_json_from(timeout=1)
        self.assertEqual(response["type"], "notification")
        self.assertEqual(response["event"], "created")
        self.assertEqual(
            response["notification"]["notification_type"], "FRIEND_REQUEST"
        )
        self.assertFalse(response["notification"]["is_read"])

        await communicator.disconnect()

    async def test_unauthenticated_rejected(self):
        path = "ws/realtime"
        communicator = WebsocketCommunicator(_build_application(), path)
        connected, _ = await communicator.connect()

        self.assertTrue(connected)

        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "auth_error")

        close = await communicator.receive_output()
        self.assertEqual(close["type"], "websocket.close")
        self.assertIn(close["code"], [4001, 4002])

        # Ensure no notification group was joined (no crash on disconnect)
