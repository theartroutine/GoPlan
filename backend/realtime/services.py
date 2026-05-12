from __future__ import annotations

from datetime import timedelta
from uuid import UUID

import jwt as pyjwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.db import transaction
from django.utils import timezone
from jwt import ExpiredSignatureError, InvalidTokenError

from realtime.models import WebSocketTicket

User = get_user_model()

WS_TICKET_SCOPE = "realtime:connect"


def issue_ws_ticket(user) -> str:
    """Issue a short-lived WebSocket ticket for the authenticated user."""
    now = timezone.now()
    expires_at = now + timedelta(seconds=settings.WS_TICKET_LIFETIME_SECONDS)
    ticket = WebSocketTicket.objects.create(
        user=user,
        auth_version=user.auth_version,
        scope=WS_TICKET_SCOPE,
        expires_at=expires_at,
    )

    return pyjwt.encode(
        {
            "jti": str(ticket.id),
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

    ticket_id = payload.get("jti")
    user_id = payload.get("sub")
    auth_version = payload.get("auth_version")

    if (
        not isinstance(ticket_id, str)
        or not isinstance(user_id, str)
        or not isinstance(auth_version, int)
    ):
        return AnonymousUser(), "auth_failed"

    try:
        normalized_ticket_id = UUID(ticket_id)
        normalized_user_id = UUID(user_id)
    except (ValueError, TypeError):
        return AnonymousUser(), "auth_failed"

    with transaction.atomic():
        try:
            ticket = (
                WebSocketTicket.objects.select_for_update()
                .select_related("user")
                .get(id=normalized_ticket_id, user_id=normalized_user_id)
            )
        except (WebSocketTicket.DoesNotExist, ValueError, TypeError):
            return AnonymousUser(), "auth_failed"

        user = ticket.user

        if (
            ticket.is_used()
            or ticket.is_expired()
            or ticket.scope != WS_TICKET_SCOPE
            or ticket.auth_version != auth_version
            or not user.is_active
            or user.auth_version != auth_version
        ):
            return AnonymousUser(), "auth_failed"

        ticket.used_at = timezone.now()
        ticket.save(update_fields=["used_at"])

    return user, None


def is_ws_user_session_valid(user) -> bool:
    """Return whether an already-open WebSocket still matches current auth state."""
    if not user or user.is_anonymous:
        return False

    try:
        current_user = User.objects.only("id", "is_active", "auth_version").get(pk=user.pk)
    except (User.DoesNotExist, ValueError, TypeError):
        return False

    return current_user.is_active and current_user.auth_version == user.auth_version
