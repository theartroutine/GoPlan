from __future__ import annotations

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.conf import settings

from realtime.services import authenticate_ws_ticket


class WebSocketAuthMiddleware(BaseMiddleware):
    """ASGI middleware that authenticates WebSocket connections via short-lived tickets."""

    async def __call__(self, scope, receive, send):
        raw_ticket, subprotocol = self._extract_ticket(scope)

        user, auth_error = await self._authenticate(raw_ticket)
        scope["user"] = user
        scope["auth_error"] = auth_error
        scope["ws_subprotocol"] = subprotocol

        return await super().__call__(scope, receive, send)

    @staticmethod
    def _extract_ticket(scope):
        subprotocols = scope.get("subprotocols", [])
        if len(subprotocols) < 2:
            return None, None

        if subprotocols[0] != settings.WS_SUBPROTOCOL:
            return None, None

        return subprotocols[1], subprotocols[0]

    @database_sync_to_async
    def _authenticate(self, raw_ticket):
        return authenticate_ws_ticket(raw_ticket)

