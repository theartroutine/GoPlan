from __future__ import annotations

from channels.db import database_sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.test import TransactionTestCase, override_settings
from django.urls import re_path

from realtime.consumers import RealtimeConsumer
from realtime.middleware import WebSocketAuthMiddleware
from realtime.services import issue_ws_ticket
from test_helpers import create_verified_user

TEST_CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}


def _build_application():
    return WebSocketAuthMiddleware(
        URLRouter([
            re_path(r"ws/realtime$", RealtimeConsumer.as_asgi()),
        ])
    )


@database_sync_to_async
def _create_user(email="consumer@example.com", password="testpass123!"):
    return create_verified_user(email=email, password=password)


@database_sync_to_async
def _issue_ws_ticket(user):
    return issue_ws_ticket(user)


@database_sync_to_async
def _increment_auth_version(user):
    user.auth_version += 1
    user.save(update_fields=["auth_version"])


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class RealtimeConsumerTests(TransactionTestCase):

    async def test_authenticated_connect(self):
        user = await _create_user()
        ticket = await _issue_ws_ticket(user)

        communicator = WebsocketCommunicator(
            _build_application(),
            "ws/realtime",
            subprotocols=[settings.WS_SUBPROTOCOL, ticket],
        )
        connected, _ = await communicator.connect()

        self.assertTrue(connected)

        # No auth_error message should be sent for authenticated connections
        self.assertTrue(await communicator.receive_nothing(timeout=0.1))

        await communicator.disconnect()

    async def test_ping_pong(self):
        user = await _create_user(email="pingpong@example.com")
        ticket = await _issue_ws_ticket(user)

        communicator = WebsocketCommunicator(
            _build_application(),
            "ws/realtime",
            subprotocols=[settings.WS_SUBPROTOCOL, ticket],
        )
        await communicator.connect()

        await communicator.send_json_to({"type": "ping"})
        response = await communicator.receive_json_from()

        self.assertEqual(response, {"type": "pong"})

        await communicator.disconnect()

    async def test_open_socket_closes_when_auth_version_is_revoked(self):
        user = await _create_user(email="open-revoked@example.com")
        ticket = await _issue_ws_ticket(user)

        communicator = WebsocketCommunicator(
            _build_application(),
            "ws/realtime",
            subprotocols=[settings.WS_SUBPROTOCOL, ticket],
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await _increment_auth_version(user)
        await communicator.send_json_to({"type": "ping"})

        response = await communicator.receive_json_from()
        self.assertEqual(response, {"type": "auth_error", "code": "auth_failed"})

        close = await communicator.receive_output()
        self.assertEqual(close["type"], "websocket.close")
        self.assertEqual(close["code"], 4001)

    async def test_disconnect_clean(self):
        user = await _create_user(email="disconnect@example.com")
        ticket = await _issue_ws_ticket(user)

        communicator = WebsocketCommunicator(
            _build_application(),
            "ws/realtime",
            subprotocols=[settings.WS_SUBPROTOCOL, ticket],
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Disconnect should not raise
        await communicator.disconnect()
