from __future__ import annotations

from unittest.mock import patch

from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from notifications.models import Notification, NotificationType
from notifications.services import (
    NotificationNotFoundError,
    create_notification,
    mark_all_notifications_read,
    mark_notification_read,
)

User = get_user_model()

TEST_CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}


def _create_verified_user(email="user@example.com", password="testpass123!"):
    user = User.objects.create_user(email=email, password=password)
    user.email_verified = True
    user.email_verified_at = timezone.now()
    user.save(update_fields=["email_verified", "email_verified_at"])
    return user


# -------- create_notification --------


class CreateNotificationTests(APITestCase):

    def test_create_notification_persists_record(self):
        recipient = _create_verified_user()
        notification = create_notification(
            recipient=recipient,
            notification_type=NotificationType.FRIEND_REQUEST,
            payload={"message": "hello"},
        )

        self.assertIsNotNone(notification.id)
        self.assertEqual(notification.recipient, recipient)
        self.assertEqual(notification.type, NotificationType.FRIEND_REQUEST)
        self.assertEqual(notification.payload, {"message": "hello"})
        self.assertIsNone(notification.actor)
        self.assertIsNone(notification.read_at)
        self.assertEqual(Notification.objects.count(), 1)

    def test_create_notification_with_actor(self):
        recipient = _create_verified_user()
        actor = _create_verified_user(email="actor@example.com")
        notification = create_notification(
            recipient=recipient,
            notification_type=NotificationType.FRIEND_ACCEPTED,
            actor=actor,
        )

        self.assertEqual(notification.actor, actor)


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class CreateNotificationWSTests(TransactionTestCase):

    def test_create_notification_handles_channel_layer_failure(self):
        recipient = _create_verified_user()

        with patch(
            "notifications.services.get_channel_layer",
            side_effect=Exception("Redis down"),
        ):
            notification = create_notification(
                recipient=recipient,
                notification_type=NotificationType.FRIEND_REQUEST,
            )

        # DB record persisted despite WS failure
        self.assertTrue(Notification.objects.filter(pk=notification.id).exists())

    def test_create_notification_pushes_after_commit(self):
        recipient = _create_verified_user()
        actor = _create_verified_user(email="actor@example.com")

        with patch(
            "notifications.services.async_to_sync"
        ) as mock_async_to_sync:
            mock_send = mock_async_to_sync.return_value
            create_notification(
                recipient=recipient,
                notification_type=NotificationType.FRIEND_REQUEST,
                actor=actor,
            )

        # on_commit callback should have fired
        mock_async_to_sync.assert_called_once()
        mock_send.assert_called_once()

        call_args = mock_send.call_args
        group_name = call_args[0][0]
        message = call_args[0][1]

        self.assertEqual(group_name, f"notifications_{recipient.id}")
        self.assertEqual(message["type"], "notification_push")
        self.assertEqual(message["data"]["type"], "notification")
        self.assertEqual(message["data"]["event"], "created")
        self.assertEqual(
            message["data"]["notification"]["notification_type"],
            "FRIEND_REQUEST",
        )
        self.assertIsNotNone(message["data"]["notification"]["actor"])


# -------- mark_notification_read --------


class MarkNotificationReadTests(APITestCase):

    def test_mark_read_success(self):
        user = _create_verified_user()
        notification = Notification.objects.create(
            recipient=user,
            type=NotificationType.FRIEND_REQUEST,
        )

        result = mark_notification_read(notification.id, user)

        notification.refresh_from_db()
        self.assertIsNotNone(notification.read_at)
        self.assertEqual(result.id, notification.id)

    def test_mark_read_idempotent(self):
        user = _create_verified_user()
        notification = Notification.objects.create(
            recipient=user,
            type=NotificationType.FRIEND_REQUEST,
            read_at=timezone.now(),
        )
        original_read_at = notification.read_at

        result = mark_notification_read(notification.id, user)

        notification.refresh_from_db()
        self.assertEqual(notification.read_at, original_read_at)
        self.assertEqual(result.id, notification.id)

    def test_mark_read_wrong_user_raises(self):
        owner = _create_verified_user()
        other = _create_verified_user(email="other@example.com")
        notification = Notification.objects.create(
            recipient=owner,
            type=NotificationType.FRIEND_REQUEST,
        )

        with self.assertRaises(NotificationNotFoundError):
            mark_notification_read(notification.id, other)


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class MarkNotificationReadConcurrencyTests(TransactionTestCase):

    def test_race_loser_does_not_push_ws(self):
        """Simulate the losing side of a concurrent mark-read race.

        Both callers read read_at=None (stale), pass the early-return
        check, but only the winner's atomic filter(read_at__isnull=True)
        .update() returns 1. The loser gets updated=0 and must NOT push
        a WS event.
        """
        user = _create_verified_user()
        notification = Notification.objects.create(
            recipient=user,
            type=NotificationType.FRIEND_REQUEST,
        )

        # Snapshot with read_at=None — simulates stale read by the loser
        stale = Notification.objects.get(pk=notification.id)

        # Simulate the winner having already updated the row
        Notification.objects.filter(pk=notification.id).update(
            read_at=timezone.now()
        )

        # Patch get() to return stale snapshot — loser still sees
        # read_at=None but filter().update() hits the real DB (already
        # updated) → returns 0
        with patch.object(
            Notification.objects, "get", return_value=stale
        ):
            with patch("notifications.services.async_to_sync") as mock_async:
                mock_send = mock_async.return_value
                result = mark_notification_read(notification.id, user)

        # Loser must NOT push a WS event
        mock_send.assert_not_called()
        # But must still return the notification (idempotent)
        self.assertEqual(result.id, notification.id)


# -------- mark_all_notifications_read --------


class MarkAllNotificationsReadTests(APITestCase):

    def test_mark_all_read(self):
        user = _create_verified_user()
        Notification.objects.create(
            recipient=user, type=NotificationType.FRIEND_REQUEST
        )
        Notification.objects.create(
            recipient=user, type=NotificationType.FRIEND_ACCEPTED
        )
        Notification.objects.create(
            recipient=user,
            type=NotificationType.FRIEND_REQUEST,
            read_at=timezone.now(),
        )

        count = mark_all_notifications_read(user)

        self.assertEqual(count, 2)
        self.assertEqual(
            Notification.objects.filter(
                recipient=user, read_at__isnull=True
            ).count(),
            0,
        )
