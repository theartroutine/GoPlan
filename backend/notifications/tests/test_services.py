from __future__ import annotations

from unittest.mock import patch

from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from notifications.models import Notification, NotificationType
from notifications.services import (
    NotificationNotFoundError,
    NotificationPayloadValidationError,
    build_notification_payload,
    build_ws_notification_message,
    create_notification,
    mark_all_notifications_read,
    mark_notification_read,
    resolve_trip_invitation_statuses,
    validate_notification_payload,
)
from test_helpers import create_verified_user
from trips.models import InvitationStatus, Trip, TripInvitation

TEST_CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}


def _make_trip(inviter):
    return Trip.objects.create(
        created_by=inviter,
        name="Da Nang",
        destination="Da Nang",
        start_date="2026-05-01",
        end_date="2026-05-05",
    )


def _trip_invitation_payload(trip, invitation_id):
    return {
        "trip_id": str(trip.id),
        "trip_name": trip.name,
        "destination": trip.destination,
        "start_date": str(trip.start_date),
        "end_date": str(trip.end_date),
        "invitation_id": str(invitation_id),
    }


# -------- create_notification --------


class CreateNotificationTests(APITestCase):

    def test_create_notification_persists_record(self):
        recipient = create_verified_user()
        notification = create_notification(
            recipient=recipient,
            notification_type=NotificationType.FRIEND_REQUEST,
        )

        self.assertIsNotNone(notification.id)
        self.assertEqual(notification.recipient, recipient)
        self.assertEqual(notification.type, NotificationType.FRIEND_REQUEST)
        self.assertEqual(notification.payload, {})
        self.assertIsNone(notification.actor)
        self.assertIsNone(notification.read_at)
        self.assertEqual(Notification.objects.count(), 1)

    def test_create_notification_with_actor(self):
        recipient = create_verified_user()
        actor = create_verified_user(email="actor@example.com")
        notification = create_notification(
            recipient=recipient,
            notification_type=NotificationType.FRIEND_ACCEPTED,
            actor=actor,
        )

        self.assertEqual(notification.actor, actor)

    def test_create_notification_persists_valid_trip_payload(self):
        recipient = create_verified_user()
        payload = {
            "trip_id": "trip-1",
            "trip_name": "Da Nang",
            "destination": "Da Nang",
            "start_date": "2026-05-01",
            "end_date": "2026-05-05",
            "invitation_id": "invitation-1",
        }

        notification = create_notification(
            recipient=recipient,
            notification_type=NotificationType.TRIP_INVITATION,
            payload=payload,
        )

        self.assertEqual(notification.type, NotificationType.TRIP_INVITATION)
        self.assertEqual(notification.payload, payload)


# -------- payload validation --------


class NotificationPayloadValidationTests(APITestCase):

    def test_validate_friend_payload_rejects_extra_keys(self):
        with self.assertRaises(NotificationPayloadValidationError):
            validate_notification_payload(
                NotificationType.FRIEND_REQUEST,
                {"message": "hello"},
            )

    def test_validate_trip_payload_requires_schema_keys(self):
        with self.assertRaises(NotificationPayloadValidationError):
            validate_notification_payload(
                NotificationType.TRIP_INVITATION,
                {
                    "trip_id": "trip-1",
                    "trip_name": "Da Nang",
                    "destination": "Da Nang",
                    "start_date": "2026-05-01",
                    "end_date": "2026-05-05",
                },
            )

    def test_validate_trip_payload_rejects_non_string_values(self):
        with self.assertRaises(NotificationPayloadValidationError):
            validate_notification_payload(
                NotificationType.TRIP_CANCELLED,
                {"trip_id": "trip-1", "trip_name": 123},
            )

    def test_validate_trip_payload_rejects_output_only_status(self):
        payload = {
            "trip_id": "trip-1",
            "trip_name": "Da Nang",
            "destination": "Da Nang",
            "start_date": "2026-05-01",
            "end_date": "2026-05-05",
            "invitation_id": "invitation-1",
            "invitation_status": InvitationStatus.PENDING,
        }

        with self.assertRaises(NotificationPayloadValidationError):
            validate_notification_payload(
                NotificationType.TRIP_INVITATION,
                payload,
            )

    def test_create_notification_does_not_persist_invalid_payload(self):
        recipient = create_verified_user()

        with self.assertRaises(NotificationPayloadValidationError):
            create_notification(
                recipient=recipient,
                notification_type=NotificationType.TRIP_MEMBER_REMOVED,
                payload={"trip_id": "trip-1"},
            )

        self.assertEqual(Notification.objects.count(), 0)

    def test_validate_timeline_reminder_payload_schema(self):
        payload = {
            "trip_id": "trip-1",
            "trip_name": "Da Lat Weekend",
            "activity_id": "activity-1",
            "activity_title": "Board train",
            "section_label": "Day 1",
            "activity_date": "2026-06-01",
            "activity_time": "09:00",
            "location_label": "Central station",
        }

        result = validate_notification_payload(
            NotificationType.TRIP_TIMELINE_REMINDER,
            payload,
        )

        self.assertEqual(result, payload)


class TripInvitationPayloadBuilderTests(APITestCase):

    def setUp(self):
        self.recipient = create_verified_user(email="invitee@example.com")
        self.inviter = create_verified_user(email="inviter@example.com")
        self.trip = _make_trip(self.inviter)

    def test_rest_and_websocket_use_same_server_derived_payload(self):
        invitation = TripInvitation.objects.create(
            trip=self.trip,
            inviter=self.inviter,
            invitee=self.recipient,
            status=InvitationStatus.PENDING,
        )
        stored_payload = _trip_invitation_payload(self.trip, invitation.id)
        notification = Notification.objects.create(
            recipient=self.recipient,
            actor=self.inviter,
            type=NotificationType.TRIP_INVITATION,
            payload=stored_payload,
        )
        TripInvitation.objects.filter(pk=invitation.id).update(
            status=InvitationStatus.ACCEPTED
        )
        statuses = resolve_trip_invitation_statuses(
            [notification],
            recipient_id=self.recipient.id,
        )

        rest_payload = build_notification_payload(
            notification,
            invitation_status=statuses[notification.id],
        )
        websocket_payload = build_ws_notification_message(notification)[
            "notification"
        ]

        self.assertEqual(websocket_payload, rest_payload)
        self.assertEqual(
            rest_payload["payload"]["invitation_status"],
            InvitationStatus.ACCEPTED,
        )
        self.assertIsNot(rest_payload["payload"], notification.payload)
        notification.refresh_from_db()
        self.assertEqual(notification.payload, stored_payload)
        self.assertNotIn("invitation_status", notification.payload)

    def test_websocket_missing_invitation_is_neutral(self):
        notification = Notification.objects.create(
            recipient=self.recipient,
            actor=self.inviter,
            type=NotificationType.TRIP_INVITATION,
            payload=_trip_invitation_payload(self.trip, self.trip.id),
        )

        websocket_payload = build_ws_notification_message(notification)

        self.assertEqual(
            websocket_payload["notification"]["payload"],
            {},
        )


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class CreateNotificationWSTests(TransactionTestCase):

    def test_create_notification_handles_channel_layer_failure(self):
        recipient = create_verified_user()

        with patch(
            "notifications.services.get_channel_layer",
            side_effect=Exception("Redis down"),
        ):
            with patch("notifications.services.logger.error") as mock_error:
                notification = create_notification(
                    recipient=recipient,
                    notification_type=NotificationType.FRIEND_REQUEST,
                )

        # DB record persisted despite WS failure
        self.assertTrue(Notification.objects.filter(pk=notification.id).exists())
        mock_error.assert_called_once()
        self.assertTrue(mock_error.call_args.kwargs["exc_info"])

    def test_create_notification_pushes_after_commit(self):
        recipient = create_verified_user()
        actor = create_verified_user(email="actor@example.com")

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
        user = create_verified_user()
        notification = Notification.objects.create(
            recipient=user,
            type=NotificationType.FRIEND_REQUEST,
        )

        result = mark_notification_read(notification.id, user)

        notification.refresh_from_db()
        self.assertIsNotNone(notification.read_at)
        self.assertEqual(result.id, notification.id)

    def test_mark_read_idempotent(self):
        user = create_verified_user()
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
        owner = create_verified_user()
        other = create_verified_user(email="other@example.com")
        notification = Notification.objects.create(
            recipient=owner,
            type=NotificationType.FRIEND_REQUEST,
        )

        with self.assertRaises(NotificationNotFoundError):
            mark_notification_read(notification.id, other)


class MarkNotificationReadTransactionTests(APITestCase):

    def test_mark_read_rolls_back_when_commit_hook_registration_fails(self):
        user = create_verified_user()
        notification = Notification.objects.create(
            recipient=user,
            type=NotificationType.FRIEND_REQUEST,
        )

        with patch(
            "notifications.services.transaction.on_commit",
            side_effect=RuntimeError("hook registration failed"),
        ):
            with self.assertRaises(RuntimeError):
                mark_notification_read(notification.id, user)

        notification.refresh_from_db()
        self.assertIsNone(notification.read_at)


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class MarkNotificationReadConcurrencyTests(TransactionTestCase):

    def test_race_loser_does_not_push_ws(self):
        """Simulate the losing side of a concurrent mark-read race.

        Both callers read read_at=None (stale), pass the early-return
        check, but only the winner's atomic filter(read_at__isnull=True)
        .update() returns 1. The loser gets updated=0 and must NOT push
        a WS event.
        """
        user = create_verified_user()
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

    def test_mark_read_handles_channel_layer_failure(self):
        user = create_verified_user(email="mark-read-ws@example.com")
        notification = Notification.objects.create(
            recipient=user,
            type=NotificationType.FRIEND_REQUEST,
        )

        with patch(
            "notifications.services.get_channel_layer",
            side_effect=Exception("Redis down"),
        ):
            with patch("notifications.services.logger.error") as mock_error:
                result = mark_notification_read(notification.id, user)

        notification.refresh_from_db()
        self.assertEqual(result.id, notification.id)
        self.assertIsNotNone(notification.read_at)
        mock_error.assert_called_once()
        self.assertTrue(mock_error.call_args.kwargs["exc_info"])


# -------- mark_all_notifications_read --------


class MarkAllNotificationsReadTests(APITestCase):

    def test_mark_all_read(self):
        user = create_verified_user()
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


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class MarkAllNotificationsReadWSTests(TransactionTestCase):

    def test_mark_all_read_handles_channel_layer_failure(self):
        user = create_verified_user(email="mark-all-read-ws@example.com")
        Notification.objects.create(
            recipient=user, type=NotificationType.FRIEND_REQUEST
        )

        with patch(
            "notifications.services.get_channel_layer",
            side_effect=Exception("Redis down"),
        ):
            with patch("notifications.services.logger.error") as mock_error:
                count = mark_all_notifications_read(user)

        self.assertEqual(count, 1)
        self.assertEqual(
            Notification.objects.filter(
                recipient=user, read_at__isnull=True
            ).count(),
            0,
        )
        mock_error.assert_called_once()
        self.assertTrue(mock_error.call_args.kwargs["exc_info"])


class MarkAllNotificationsReadTransactionTests(APITestCase):

    def test_mark_all_read_rolls_back_when_commit_hook_registration_fails(
        self,
    ):
        user = create_verified_user()
        Notification.objects.create(
            recipient=user, type=NotificationType.FRIEND_REQUEST
        )
        Notification.objects.create(
            recipient=user, type=NotificationType.FRIEND_ACCEPTED
        )

        with patch(
            "notifications.services.transaction.on_commit",
            side_effect=RuntimeError("hook registration failed"),
        ):
            with self.assertRaises(RuntimeError):
                mark_all_notifications_read(user)

        self.assertEqual(
            Notification.objects.filter(
                recipient=user, read_at__isnull=True
            ).count(),
            2,
        )
