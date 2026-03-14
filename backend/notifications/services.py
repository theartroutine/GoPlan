import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.utils import timezone

from notifications.models import Notification

logger = logging.getLogger(__name__)


# -------- Exceptions --------


class NotificationNotFoundError(Exception):
    pass


# -------- Payload Builders --------


def _build_actor_payload(user):
    """Minimal actor representation for notification payloads."""
    if user is None:
        return None
    return {
        "id": str(user.id),
        "display_name": user.display_name,
        "identify_tag": user.identify_tag,
    }


def build_notification_payload(notification):
    """Single source of truth for notification serialization.

    Used by both the REST serializer and WebSocket message builder.
    """
    return {
        "id": str(notification.id),
        "notification_type": notification.type,
        "actor": _build_actor_payload(notification.actor),
        "payload": notification.payload,
        "is_read": notification.read_at is not None,
        "read_at": (
            notification.read_at.isoformat() if notification.read_at else None
        ),
        "created_at": notification.created_at.isoformat(),
    }


def build_ws_notification_message(notification):
    """Format a notification for WebSocket transport.

    The outer ``type`` field is used by wsManager for routing.
    The inner ``notification`` dict carries the business payload.
    """
    return {
        "type": "notification",
        "event": "created",
        "notification": build_notification_payload(notification),
    }


# -------- Service Functions --------


def create_notification(recipient, notification_type, payload=None, actor=None):
    """Create a notification and push it via WebSocket after DB commit."""
    with transaction.atomic():
        notification = Notification.objects.create(
            recipient=recipient,
            actor=actor,
            type=notification_type,
            payload=payload or {},
        )

    def _push_ws():
        try:
            channel_layer = get_channel_layer()
            message = build_ws_notification_message(notification)
            async_to_sync(channel_layer.group_send)(
                f"notifications_{recipient.id}",
                {"type": "notification_push", "data": message},
            )
        except Exception:
            logger.exception(
                "Failed to push notification %s via WebSocket", notification.id
            )

    transaction.on_commit(_push_ws)
    return notification


def mark_notification_read(notification_id, user):
    """Mark a single notification as read. Idempotent.

    Uses atomic filter-update to prevent duplicate WS events when
    concurrent requests mark the same notification.
    Pushes a WS event so other connected clients sync read state.
    """
    try:
        notification = Notification.objects.get(pk=notification_id, recipient=user)
    except Notification.DoesNotExist:
        raise NotificationNotFoundError("Notification not found.")

    if notification.read_at is not None:
        return notification

    # Atomic: only one concurrent request will match the filter
    updated = Notification.objects.filter(
        pk=notification_id, read_at__isnull=True
    ).update(read_at=timezone.now())

    notification.refresh_from_db()

    if updated == 0:
        # Another request already marked it — return idempotent, no WS push
        return notification

    def _push_read():
        try:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"notifications_{user.id}",
                {
                    "type": "notification_push",
                    "data": {
                        "type": "notification",
                        "event": "read",
                        "notification_ids": [str(notification.id)],
                    },
                },
            )
        except Exception:
            logger.exception("Failed to push read event via WebSocket")

    transaction.on_commit(_push_read)
    return notification


def mark_all_notifications_read(user):
    """Mark all unread notifications as read for a user.

    Pushes a WS event so other connected clients sync read state.
    Returns the number of notifications updated.
    """
    count = Notification.objects.filter(
        recipient=user, read_at__isnull=True
    ).update(read_at=timezone.now())

    def _push_read_all():
        try:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"notifications_{user.id}",
                {
                    "type": "notification_push",
                    "data": {
                        "type": "notification",
                        "event": "read_all",
                    },
                },
            )
        except Exception:
            logger.exception("Failed to push read_all event via WebSocket")

    transaction.on_commit(_push_read_all)
    return count
