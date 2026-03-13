from __future__ import annotations

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings


class BaseConsumer(AsyncJsonWebsocketConsumer):
    """Abstract base consumer — auth check, heartbeat pong.

    Subclasses (ConnectionConsumer, NotificationConsumer, etc.) inherit
    auth enforcement and ping/pong handling.

    Auth rejection flow (accept-then-close trade-off):
        If the user is anonymous, we accept() first then send an auth_error
        message and close with the appropriate code. This ensures the browser
        reliably receives the close code (closing before accept yields generic
        1006 in most browsers). The connection lives for only a few milliseconds,
        does not join any group, and does not exchange any data.
    """

    async def connect(self):
        if self.scope["user"].is_anonymous:
            await self.accept()
            auth_error = self.scope.get("auth_error", "auth_failed")
            close_code = settings.WS_CLOSE_CODES.get(
                'TOKEN_EXPIRED' if auth_error == 'token_expired' else 'AUTH_FAILED'
            )
            await self.send_json({"type": "auth_error", "code": auth_error})
            await self.close(code=close_code)
            return

        self.user = self.scope["user"]
        await self.accept()

    async def receive_json(self, content, **kwargs):
        if self.scope["user"].is_anonymous:
            return
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})
            return
        await self.handle_message(content)

    async def handle_message(self, content):
        """Override in subclasses for domain-specific messages."""
        pass


class ConnectionConsumer(BaseConsumer):
    """Concrete consumer routed at /ws/connect — verifies connection works.

    Inherits ping/pong and auth check from BaseConsumer.
    Future consumers (NotificationConsumer, ChatConsumer) will also
    extend BaseConsumer.
    """

    pass
