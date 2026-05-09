from __future__ import annotations

from datetime import timedelta
from uuid import uuid4
from unittest.mock import patch

from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from chat.models import ChatMessage
from chat.services import (
    ChatInvalidContentError,
    list_chat_messages,
    send_chat_message,
)
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus
from trips.services import TripNotFoundError, TripTerminalError

TEST_CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}


def _make_trip(captain, *, status=TripStatus.PLANNING):
    trip = Trip.objects.create(
        created_by=captain,
        name="Chat Trip",
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


def _make_message(trip, sender, content, created_at):
    message = ChatMessage.objects.create(
        trip=trip,
        sender=sender,
        sender_display_name_snapshot=sender.display_name,
        sender_identify_tag_snapshot=sender.identify_tag,
        content=content,
        client_message_id=uuid4(),
    )
    ChatMessage.objects.filter(pk=message.pk).update(created_at=created_at)
    message.refresh_from_db()
    return message


class SendChatMessageServiceTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("cap@example.com", "captain", "CAP001")
        self.member = create_completed_user("mem@example.com", "member", "MEM001")
        self.other = create_completed_user("other@example.com", "other", "OTH001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)

    def test_send_chat_message_creates_message_with_snapshots(self):
        client_message_id = uuid4()

        message, created = send_chat_message(
            user=self.member,
            trip_id=self.trip.id,
            content="  Hello trip  ",
            client_message_id=client_message_id,
        )

        self.assertTrue(created)
        self.assertEqual(message.content, "Hello trip")
        self.assertEqual(message.client_message_id, client_message_id)
        self.assertEqual(message.sender_display_name_snapshot, self.member.display_name)
        self.assertEqual(message.sender_identify_tag_snapshot, self.member.identify_tag)
        self.assertEqual(ChatMessage.objects.count(), 1)

    def test_idempotent_retry_returns_existing_message(self):
        client_message_id = uuid4()
        first, first_created = send_chat_message(
            user=self.member,
            trip_id=self.trip.id,
            content="Hello once",
            client_message_id=client_message_id,
        )

        second, second_created = send_chat_message(
            user=self.member,
            trip_id=self.trip.id,
            content="Hello twice",
            client_message_id=client_message_id,
        )

        self.assertTrue(first_created)
        self.assertFalse(second_created)
        self.assertEqual(first.id, second.id)
        self.assertEqual(second.content, "Hello once")
        self.assertEqual(ChatMessage.objects.count(), 1)

    def test_non_member_gets_trip_not_found(self):
        with self.assertRaises(TripNotFoundError):
            send_chat_message(
                user=self.other,
                trip_id=self.trip.id,
                content="No access",
                client_message_id=uuid4(),
            )

    def test_terminal_trip_rejects_new_message(self):
        self.trip.status = TripStatus.COMPLETED
        self.trip.save(update_fields=["status"])

        with self.assertRaises(TripTerminalError):
            send_chat_message(
                user=self.member,
                trip_id=self.trip.id,
                content="Too late",
                client_message_id=uuid4(),
            )

    def test_blank_content_rejected(self):
        with self.assertRaises(ChatInvalidContentError):
            send_chat_message(
                user=self.member,
                trip_id=self.trip.id,
                content="   ",
                client_message_id=uuid4(),
            )


class ListChatMessagesServiceTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("cap-list@example.com", "caplist", "CLT001")
        self.member = create_completed_user("mem-list@example.com", "memlist", "MLT001")
        self.other = create_completed_user("other-list@example.com", "othlist", "OLT001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)
        base = timezone.now()
        self.messages = [
            _make_message(self.trip, self.member, "one", base + timedelta(seconds=1)),
            _make_message(self.trip, self.member, "two", base + timedelta(seconds=2)),
            _make_message(self.trip, self.member, "three", base + timedelta(seconds=3)),
            _make_message(self.trip, self.member, "four", base + timedelta(seconds=4)),
        ]

    def test_history_returns_descending_page_and_cursor(self):
        page = list_chat_messages(user=self.member, trip_id=self.trip.id, limit=2)

        self.assertEqual([m["content"] for m in page["results"]], ["four", "three"])
        self.assertIsNotNone(page["next_cursor"])

        next_page = list_chat_messages(
            user=self.member,
            trip_id=self.trip.id,
            cursor=page["next_cursor"],
            limit=2,
        )
        self.assertEqual([m["content"] for m in next_page["results"]], ["two", "one"])
        self.assertIsNone(next_page["next_cursor"])

    def test_gap_fill_returns_ascending_with_has_more(self):
        page = list_chat_messages(
            user=self.member,
            trip_id=self.trip.id,
            since=self.messages[0].id,
            limit=2,
        )

        self.assertEqual([m["content"] for m in page["results"]], ["two", "three"])
        self.assertTrue(page["has_more"])

        next_page = list_chat_messages(
            user=self.member,
            trip_id=self.trip.id,
            since=page["results"][-1]["id"],
            limit=2,
        )
        self.assertEqual([m["content"] for m in next_page["results"]], ["four"])
        self.assertFalse(next_page["has_more"])

    def test_non_member_cannot_list(self):
        with self.assertRaises(TripNotFoundError):
            list_chat_messages(user=self.other, trip_id=self.trip.id)


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class ChatMessagePushTests(TransactionTestCase):

    def test_new_message_pushes_after_commit(self):
        captain = create_completed_user("push-cap@example.com", "pushcap", "PCA001")
        member = create_completed_user("push-mem@example.com", "pushmem", "PME001")
        trip = _make_trip(captain)
        _add_member(trip, member)

        with patch("chat.services.async_to_sync") as mock_async_to_sync:
            mock_send = mock_async_to_sync.return_value
            message, created = send_chat_message(
                user=member,
                trip_id=trip.id,
                content="Push me",
                client_message_id=uuid4(),
            )

        self.assertTrue(created)
        mock_async_to_sync.assert_called_once()
        mock_send.assert_called_once()
        self.assertEqual(mock_send.call_args[0][0], f"trip_chat_{trip.id}")
        self.assertEqual(mock_send.call_args[0][1]["type"], "chat_message_push")
        self.assertEqual(
            mock_send.call_args[0][1]["data"]["message"]["id"],
            str(message.id),
        )

    def test_idempotent_retry_does_not_push_again(self):
        captain = create_completed_user("retry-cap@example.com", "retrycap", "RCA001")
        member = create_completed_user("retry-mem@example.com", "retrymem", "RME001")
        trip = _make_trip(captain)
        _add_member(trip, member)
        client_message_id = uuid4()

        send_chat_message(
            user=member,
            trip_id=trip.id,
            content="First",
            client_message_id=client_message_id,
        )

        with patch("chat.services.async_to_sync") as mock_async_to_sync:
            _message, created = send_chat_message(
                user=member,
                trip_id=trip.id,
                content="Retry",
                client_message_id=client_message_id,
            )

        self.assertFalse(created)
        mock_async_to_sync.assert_not_called()
