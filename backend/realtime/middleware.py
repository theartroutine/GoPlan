from __future__ import annotations

import time
from urllib.parse import parse_qs

import jwt as pyjwt
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.exceptions import InvalidToken

from accounts.authentication import JWTAuthentication


class WebSocketJWTMiddleware(BaseMiddleware):
    """ASGI middleware that authenticates WebSocket connections via JWT query param.

    Reuses JWTAuthentication from accounts app — single source of truth for auth.
    Sets scope["user"] and scope["auth_error"] for downstream consumers.
    """

    async def __call__(self, scope, receive, send):
        query = parse_qs(scope.get("query_string", b"").decode())
        raw_token = query.get("token", [None])[0]

        user, auth_error = await self._authenticate(raw_token)
        scope["user"] = user
        scope["auth_error"] = auth_error

        return await super().__call__(scope, receive, send)

    @database_sync_to_async
    def _authenticate(self, raw_token):
        """Returns (user, auth_error). auth_error is None on success."""
        if not raw_token:
            return AnonymousUser(), "auth_failed"

        jwt_auth = JWTAuthentication()

        # Step 1: Validate token (signature, expiry, type)
        try:
            validated_token = jwt_auth.get_validated_token(raw_token)
        except InvalidToken:
            return AnonymousUser(), self._classify_token_error(raw_token)

        # Step 2: Lookup user + check auth_version
        try:
            user = jwt_auth.get_user(validated_token)
        except (InvalidToken, AuthenticationFailed):
            # InvalidToken: auth_version mismatch (from custom get_user in accounts)
            # AuthenticationFailed: user_not_found or user_inactive (from base SimpleJWT —
            #   it catches User.DoesNotExist internally and wraps as AuthenticationFailed)
            return AnonymousUser(), "auth_failed"

        return user, None

    @staticmethod
    def _classify_token_error(raw_token):
        """Classify token error for reconnect logic. NOT auth validation.

        Only reads the exp claim to distinguish expired vs invalid tokens,
        helping the client decide whether to refresh. Decodes without signature
        verification because the token already failed validation in the step above.
        """
        try:
            payload = pyjwt.decode(raw_token, options={"verify_signature": False})
            exp = payload.get("exp", 0)
            if isinstance(exp, (int, float)) and exp < time.time():
                return "token_expired"
        except (pyjwt.DecodeError, KeyError):
            pass
        return "auth_failed"
