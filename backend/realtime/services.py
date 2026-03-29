from __future__ import annotations

from datetime import timedelta

import jwt as pyjwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone
from jwt import ExpiredSignatureError, InvalidTokenError

User = get_user_model()

WS_TICKET_SCOPE = "realtime:connect"


def issue_ws_ticket(user) -> str:
    """Issue a short-lived WebSocket ticket for the authenticated user."""
    now = timezone.now()
    expires_at = now + timedelta(seconds=settings.WS_TICKET_LIFETIME_SECONDS)

    return pyjwt.encode(
        {
            "sub": str(user.id),
            "auth_version": user.auth_version,
            "scope": WS_TICKET_SCOPE,
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )


def authenticate_ws_ticket(raw_ticket):
    """Validate a short-lived WebSocket ticket and return (user, auth_error)."""
    if not raw_ticket:
        return AnonymousUser(), "auth_failed"

    try:
        payload = pyjwt.decode(
            raw_ticket,
            settings.SECRET_KEY,
            algorithms=["HS256"],
        )
    except ExpiredSignatureError:
        return AnonymousUser(), "token_expired"
    except InvalidTokenError:
        return AnonymousUser(), "auth_failed"

    if payload.get("scope") != WS_TICKET_SCOPE:
        return AnonymousUser(), "auth_failed"

    user_id = payload.get("sub")
    auth_version = payload.get("auth_version")

    if not isinstance(user_id, str) or not isinstance(auth_version, int):
        return AnonymousUser(), "auth_failed"

    try:
        user = User.objects.get(pk=user_id)
    except (User.DoesNotExist, ValueError, TypeError):
        return AnonymousUser(), "auth_failed"

    if not user.is_active or user.auth_version != auth_version:
        return AnonymousUser(), "auth_failed"

    return user, None
