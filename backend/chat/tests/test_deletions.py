from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from chat.models import ChatMessage, MessageReaction
from chat.services import (
    ChatDeleteForbiddenError,
    ChatDeleteWindowExpiredError,
    build_chat_message_payload,
    delete_message_for_everyone,
    hide_messages_for_user,
    list_chat_messages,
)
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus
from trips.services import TripNotFoundError, TripTerminalError

TEST_CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _make_trip(captain, *, status=TripStatus.PLANNING):
    trip = Trip.objects.create(
        created_by=captain,
        name="Delete Chat Trip",
        destination="Da Nang",
        start_date="2026-06-01",
        end_date="2026-06-05",
        status=status,
    )
    TripMember.objects.create(
        trip=trip,
        user=captain,
        role=TripRole.CAPTAIN,
        status=MemberStatus.ACTIVE,
    )
    return trip


def _add_member(trip, user):
    return TripMember.objects.create(
        trip=trip,
        user=user,
        role=TripRole.MEMBER,
        status=MemberStatus.ACTIVE,
    )


def _make_message(trip, sender, content="Hello delete"):
    message = ChatMessage.objects.create(
        trip=trip,
        sender=sender,
        sender_display_name_snapshot=sender.display_name,
        sender_identify_tag_snapshot=sender.identify_tag,
        content=content,
        client_message_id=uuid4(),
    )
    return message


def _message_url(trip_id, message_id):
    return f"/api/trips/{trip_id}/chat/messages/{message_id}"


def _bulk_hide_url(trip_id):
    return f"/api/trips/{trip_id}/chat/messages/hide"


class ChatMessageDeletionServiceTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("del-cap@example.com", "delcap", "DCA001")
        self.member = create_completed_user("del-mem@example.com", "delmem", "DME001")
        self.other = create_completed_user("del-out@example.com", "delout", "DOT001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)
        self.message = _make_message(self.trip, self.captain, "Private itinerary")

    def test_hide_messages_for_user_only_removes_from_that_users_history(self):
        hidden_ids = hide_messages_for_user(
            user=self.member,
            trip_id=self.trip.id,
            message_ids=[self.message.id],
        )

        self.assertEqual(hidden_ids, [str(self.message.id)])
        member_page = list_chat_messages(user=self.member, trip_id=self.trip.id)
        captain_page = list_chat_messages(user=self.captain, trip_id=self.trip.id)
        self.assertEqual(member_page["results"], [])
        self.assertEqual(captain_page["results"][0]["id"], str(self.message.id))
        self.assertEqual(captain_page["results"][0]["content"], "Private itinerary")

    def test_hide_messages_for_user_is_idempotent(self):
        first = hide_messages_for_user(
            user=self.member,
            trip_id=self.trip.id,
            message_ids=[self.message.id],
        )
        second = hide_messages_for_user(
            user=self.member,
            trip_id=self.trip.id,
            message_ids=[self.message.id],
        )

        self.assertEqual(first, [str(self.message.id)])
        self.assertEqual(second, [str(self.message.id)])

    def test_delete_for_everyone_tombstones_message_and_removes_reactions(self):
        MessageReaction.objects.create(message=self.message, user=self.member, emoji="👍")

        deleted = delete_message_for_everyone(
            user=self.captain,
            trip_id=self.trip.id,
            message_id=self.message.id,
        )

        self.assertEqual(deleted.id, self.message.id)
        deleted.refresh_from_db()
        self.assertEqual(deleted.content, "")
        self.assertIsNotNone(deleted.deleted_for_everyone_at)
        self.assertEqual(deleted.deleted_for_everyone_by_id, self.captain.id)
        self.assertFalse(MessageReaction.objects.filter(message=deleted).exists())
        payload = build_chat_message_payload(deleted)
        self.assertTrue(payload["is_deleted_for_everyone"])
        self.assertEqual(payload["content"], "")
        self.assertEqual(payload["reactions"], [])
        self.assertIsNone(payload["delete_for_everyone_until"])
        self.assertFalse(payload["can_delete_for_everyone"])

    def test_payload_exposes_server_delete_window_for_active_message(self):
        payload = build_chat_message_payload(self.message)

        self.assertEqual(
            payload["delete_for_everyone_until"],
            (self.message.created_at + timedelta(minutes=5)).isoformat(),
        )
        self.assertTrue(payload["can_delete_for_everyone"])

    def test_delete_for_everyone_rejects_non_sender(self):
        with self.assertRaises(ChatDeleteForbiddenError):
            delete_message_for_everyone(
                user=self.member,
                trip_id=self.trip.id,
                message_id=self.message.id,
            )

    def test_delete_for_everyone_rejects_after_window(self):
        old_created_at = timezone.now() - timedelta(minutes=6)
        ChatMessage.objects.filter(pk=self.message.pk).update(created_at=old_created_at)

        with self.assertRaises(ChatDeleteWindowExpiredError):
            delete_message_for_everyone(
                user=self.captain,
                trip_id=self.trip.id,
                message_id=self.message.id,
            )

    def test_delete_for_everyone_rejects_terminal_trip(self):
        self.trip.status = TripStatus.COMPLETED
        self.trip.save(update_fields=["status"])

        with self.assertRaises(TripTerminalError):
            delete_message_for_everyone(
                user=self.captain,
                trip_id=self.trip.id,
                message_id=self.message.id,
            )

    def test_hide_messages_for_user_rejects_terminal_trip(self):
        self.trip.status = TripStatus.CANCELLED
        self.trip.save(update_fields=["status"])

        with self.assertRaises(TripTerminalError):
            hide_messages_for_user(
                user=self.member,
                trip_id=self.trip.id,
                message_ids=[self.message.id],
            )

    def test_non_member_cannot_hide_message(self):
        with self.assertRaises(TripNotFoundError):
            hide_messages_for_user(
                user=self.other,
                trip_id=self.trip.id,
                message_ids=[self.message.id],
            )


class ChatMessageDeletionAPITests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("del-api-cap@example.com", "delapicap", "DAC001")
        self.member = create_completed_user("del-api-mem@example.com", "delapimem", "DAM001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)
        self.message = _make_message(self.trip, self.captain, "Delete through API")

    def test_delete_for_me_hides_single_message(self):
        response = self.client.delete(
            _message_url(self.trip.id, self.message.id),
            {"mode": "for_me"},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["hidden_message_ids"], [str(self.message.id)])
        page = self.client.get(
            f"/api/trips/{self.trip.id}/chat/messages",
            **_auth(self.member),
        )
        self.assertEqual(page.status_code, 200)
        self.assertEqual(page.data["results"], [])

    def test_delete_for_everyone_tombstones_single_message(self):
        response = self.client.delete(
            _message_url(self.trip.id, self.message.id),
            {"mode": "for_everyone"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"]["id"], str(self.message.id))
        self.assertTrue(response.data["message"]["is_deleted_for_everyone"])
        self.assertEqual(response.data["message"]["content"], "")

    def test_delete_for_everyone_by_non_sender_returns_403(self):
        response = self.client.delete(
            _message_url(self.trip.id, self.message.id),
            {"mode": "for_everyone"},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error_code"], "MESSAGE_DELETE_FORBIDDEN")

    def test_delete_for_everyone_terminal_trip_returns_409(self):
        self.trip.status = TripStatus.COMPLETED
        self.trip.save(update_fields=["status"])

        response = self.client.delete(
            _message_url(self.trip.id, self.message.id),
            {"mode": "for_everyone"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "TRIP_TERMINAL")

    def test_delete_for_me_terminal_trip_returns_409(self):
        self.trip.status = TripStatus.CANCELLED
        self.trip.save(update_fields=["status"])

        response = self.client.delete(
            _message_url(self.trip.id, self.message.id),
            {"mode": "for_me"},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "TRIP_TERMINAL")

    def test_bulk_hide_hides_multiple_messages_for_current_user(self):
        second = _make_message(self.trip, self.member, "Second")

        response = self.client.post(
            _bulk_hide_url(self.trip.id),
            {"message_ids": [str(self.message.id), str(second.id)]},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(response.data["hidden_message_ids"]),
            {str(self.message.id), str(second.id)},
        )
        page = self.client.get(
            f"/api/trips/{self.trip.id}/chat/messages",
            **_auth(self.member),
        )
        self.assertEqual(page.data["results"], [])


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class ChatMessageDeletionPushTests(TransactionTestCase):

    def test_delete_for_everyone_pushes_message_deleted_after_commit(self):
        captain = create_completed_user("del-push-cap@example.com", "delpushcap", "DPC001")
        trip = _make_trip(captain)
        message = _make_message(trip, captain, "Push delete")

        with patch("chat.services.async_to_sync") as mock_async_to_sync:
            mock_send = mock_async_to_sync.return_value
            deleted = delete_message_for_everyone(
                user=captain,
                trip_id=trip.id,
                message_id=message.id,
            )

        self.assertEqual(deleted.id, message.id)
        mock_async_to_sync.assert_called_once()
        mock_send.assert_called_once()
        self.assertEqual(mock_send.call_args[0][0], f"trip_chat_{trip.id}")
        self.assertEqual(mock_send.call_args[0][1]["type"], "chat_message_deleted_push")
        self.assertEqual(
            mock_send.call_args[0][1]["data"]["message"]["id"],
            str(message.id),
        )
