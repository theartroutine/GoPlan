from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

from django.db import IntegrityError
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from chat.models import ALLOWED_REACTION_EMOJIS, ChatMessage, MessageReaction
from chat.services import (
    ChatReactionDuplicateError,
    ChatServiceError,
    ChatReactionInvalidEmojiError,
    ChatReactionNotFoundError,
    add_reaction,
    build_reactions_payload,
    remove_reaction,
)
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus
from trips.services import TripNotFoundError, TripTerminalError


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _make_trip(captain, *, status=TripStatus.PLANNING):
    trip = Trip.objects.create(
        created_by=captain,
        name="Reaction Test Trip",
        destination="Hoi An",
        start_date="2026-07-01",
        end_date="2026-07-05",
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


def _make_message(trip, sender):
    return ChatMessage.objects.create(
        trip=trip,
        sender=sender,
        sender_display_name_snapshot=sender.display_name,
        sender_identify_tag_snapshot=sender.identify_tag,
        content="Hello reactions",
    )


def _reactions_url(trip_id, message_id):
    return f"/api/trips/{trip_id}/chat/messages/{message_id}/reactions"


def _reaction_detail_url(trip_id, message_id, emoji):
    from urllib.parse import quote
    return f"/api/trips/{trip_id}/chat/messages/{message_id}/reactions/{quote(emoji, safe='')}"


# -------- Service-layer unit tests --------

class BuildReactionsPayloadTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("react-svc-cap@example.com", "rxcap", "RXC001")
        self.member = create_completed_user("react-svc-mem@example.com", "rxmem", "RXM001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)
        self.message = _make_message(self.trip, self.captain)

    def test_empty_reactions(self):
        payload = build_reactions_payload(self.message)
        self.assertEqual(payload, [])

    def test_single_reaction(self):
        MessageReaction.objects.create(
            message=self.message,
            user=self.captain,
            emoji="❤️",
        )
        payload = build_reactions_payload(self.message)
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["emoji"], "❤️")
        self.assertEqual(payload[0]["count"], 1)
        self.assertIn(str(self.captain.id), payload[0]["reacted_by_ids"])

    def test_multiple_users_same_emoji(self):
        MessageReaction.objects.create(message=self.message, user=self.captain, emoji="👍")
        MessageReaction.objects.create(message=self.message, user=self.member, emoji="👍")
        payload = build_reactions_payload(self.message)
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["emoji"], "👍")
        self.assertEqual(payload[0]["count"], 2)
        self.assertIn(str(self.captain.id), payload[0]["reacted_by_ids"])
        self.assertIn(str(self.member.id), payload[0]["reacted_by_ids"])

    def test_multiple_emojis(self):
        MessageReaction.objects.create(message=self.message, user=self.captain, emoji="❤️")
        MessageReaction.objects.create(message=self.message, user=self.member, emoji="😂")
        payload = build_reactions_payload(self.message)
        emojis = {r["emoji"] for r in payload}
        self.assertEqual(emojis, {"❤️", "😂"})


class AddReactionServiceTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("add-svc-cap@example.com", "adcap", "ADC001")
        self.member = create_completed_user("add-svc-mem@example.com", "admem", "ADM001")
        self.outsider = create_completed_user("add-svc-out@example.com", "adout", "ADO001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)
        self.message = _make_message(self.trip, self.captain)

    @patch("chat.services._push_reaction_update")
    def test_add_reaction_happy_path(self, mock_push):
        reactions = add_reaction(
            user=self.member,
            trip_id=self.trip.id,
            message_id=self.message.id,
            emoji="❤️",
        )
        self.assertTrue(MessageReaction.objects.filter(
            message=self.message, user=self.member, emoji="❤️"
        ).exists())
        self.assertEqual(len(reactions), 1)
        self.assertEqual(reactions[0]["emoji"], "❤️")

    def test_add_invalid_emoji_raises(self):
        with self.assertRaises(ChatReactionInvalidEmojiError):
            add_reaction(
                user=self.member,
                trip_id=self.trip.id,
                message_id=self.message.id,
                emoji="🦄",
            )

    def test_add_duplicate_raises(self):
        MessageReaction.objects.create(
            message=self.message, user=self.member, emoji="❤️"
        )
        with self.assertRaises(ChatReactionDuplicateError):
            add_reaction(
                user=self.member,
                trip_id=self.trip.id,
                message_id=self.message.id,
                emoji="❤️",
            )

    def test_add_non_member_raises(self):
        with self.assertRaises(TripNotFoundError):
            add_reaction(
                user=self.outsider,
                trip_id=self.trip.id,
                message_id=self.message.id,
                emoji="👍",
            )

    @patch("chat.services._push_reaction_update")
    def test_replace_reaction_replaces_existing(self, mock_push):
        """Adding a different emoji atomically replaces the user's existing reaction."""
        add_reaction(
            user=self.member,
            trip_id=self.trip.id,
            message_id=self.message.id,
            emoji="❤️",
        )
        reactions = add_reaction(
            user=self.member,
            trip_id=self.trip.id,
            message_id=self.message.id,
            emoji="😂",
        )
        self.assertFalse(MessageReaction.objects.filter(
            message=self.message, user=self.member, emoji="❤️"
        ).exists())
        self.assertTrue(MessageReaction.objects.filter(
            message=self.message, user=self.member, emoji="😂"
        ).exists())
        self.assertEqual(len(reactions), 1)
        self.assertEqual(reactions[0]["emoji"], "😂")

    def test_add_wrong_trip_message_raises(self):
        other_captain = create_completed_user("other-cap@example.com", "othcap", "OTC001")
        other_trip = _make_trip(other_captain)
        other_msg = _make_message(other_trip, other_captain)

        with self.assertRaises(TripNotFoundError):
            add_reaction(
                user=self.member,
                trip_id=self.trip.id,
                message_id=other_msg.id,
                emoji="👍",
            )

    def test_add_reaction_rejects_terminal_trip(self):
        self.trip.status = TripStatus.COMPLETED
        self.trip.save(update_fields=["status"])

        with self.assertRaises(TripTerminalError):
            add_reaction(
                user=self.member,
                trip_id=self.trip.id,
                message_id=self.message.id,
                emoji="👍",
            )

    def test_add_reaction_rejects_deleted_message(self):
        self.message.deleted_for_everyone_at = timezone.now()
        self.message.deleted_for_everyone_by = self.captain
        self.message.save(
            update_fields=["deleted_for_everyone_at", "deleted_for_everyone_by"]
        )

        with self.assertRaises(ChatServiceError) as ctx:
            add_reaction(
                user=self.member,
                trip_id=self.trip.id,
                message_id=self.message.id,
                emoji="👍",
            )

        self.assertEqual(ctx.exception.error_code, "MESSAGE_DELETED")


class RemoveReactionServiceTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("rm-svc-cap@example.com", "rmcap", "RMC001")
        self.member = create_completed_user("rm-svc-mem@example.com", "rmmem", "RMM001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)
        self.message = _make_message(self.trip, self.captain)

    @patch("chat.services._push_reaction_update")
    def test_remove_reaction_happy_path(self, mock_push):
        MessageReaction.objects.create(
            message=self.message, user=self.member, emoji="😂"
        )
        reactions = remove_reaction(
            user=self.member,
            trip_id=self.trip.id,
            message_id=self.message.id,
            emoji="😂",
        )
        self.assertFalse(MessageReaction.objects.filter(
            message=self.message, user=self.member, emoji="😂"
        ).exists())
        self.assertEqual(reactions, [])

    def test_remove_nonexistent_raises(self):
        with self.assertRaises(ChatReactionNotFoundError):
            remove_reaction(
                user=self.member,
                trip_id=self.trip.id,
                message_id=self.message.id,
                emoji="😂",
            )

    def test_remove_invalid_emoji_raises(self):
        with self.assertRaises(ChatReactionInvalidEmojiError):
            remove_reaction(
                user=self.member,
                trip_id=self.trip.id,
                message_id=self.message.id,
                emoji="🐉",
            )

    def test_remove_other_users_reaction_raises(self):
        MessageReaction.objects.create(
            message=self.message, user=self.captain, emoji="❤️"
        )
        with self.assertRaises(ChatReactionNotFoundError):
            remove_reaction(
                user=self.member,
                trip_id=self.trip.id,
                message_id=self.message.id,
                emoji="❤️",
            )

    def test_remove_reaction_rejects_terminal_trip(self):
        MessageReaction.objects.create(
            message=self.message, user=self.member, emoji="👍"
        )
        self.trip.status = TripStatus.CANCELLED
        self.trip.save(update_fields=["status"])

        with self.assertRaises(TripTerminalError):
            remove_reaction(
                user=self.member,
                trip_id=self.trip.id,
                message_id=self.message.id,
                emoji="👍",
            )

    def test_remove_reaction_rejects_deleted_message(self):
        MessageReaction.objects.create(
            message=self.message, user=self.member, emoji="👍"
        )
        self.message.deleted_for_everyone_at = timezone.now()
        self.message.deleted_for_everyone_by = self.captain
        self.message.save(
            update_fields=["deleted_for_everyone_at", "deleted_for_everyone_by"]
        )

        with self.assertRaises(ChatServiceError) as ctx:
            remove_reaction(
                user=self.member,
                trip_id=self.trip.id,
                message_id=self.message.id,
                emoji="👍",
            )

        self.assertEqual(ctx.exception.error_code, "MESSAGE_DELETED")


# -------- API (view) tests --------

class MessageReactionAPIAddTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("api-add-cap@example.com", "aacap", "AAC001")
        self.member = create_completed_user("api-add-mem@example.com", "aamem", "AAM001")
        self.outsider = create_completed_user("api-add-out@example.com", "aaout", "AAO001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)
        self.message = _make_message(self.trip, self.captain)
        self.url = _reactions_url(self.trip.id, self.message.id)

    def test_add_reaction_201(self):
        response = self.client.post(
            self.url,
            {"emoji": "❤️"},
            format="json",
            **_auth(self.member),
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("reactions", response.data)
        self.assertEqual(len(response.data["reactions"]), 1)
        self.assertEqual(response.data["reactions"][0]["emoji"], "❤️")
        self.assertEqual(response.data["reactions"][0]["count"], 1)

    def test_add_invalid_emoji_400(self):
        response = self.client.post(
            self.url,
            {"emoji": "🦄"},
            format="json",
            **_auth(self.member),
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error_code"], "INVALID_EMOJI")

    def test_add_duplicate_reaction_409(self):
        self.client.post(self.url, {"emoji": "👍"}, format="json", **_auth(self.member))
        response = self.client.post(
            self.url,
            {"emoji": "👍"},
            format="json",
            **_auth(self.member),
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "REACTION_DUPLICATE")

    def test_non_member_cannot_react_404(self):
        response = self.client.post(
            self.url,
            {"emoji": "❤️"},
            format="json",
            **_auth(self.outsider),
        )
        self.assertEqual(response.status_code, 404)

    def test_unauthenticated_401(self):
        response = self.client.post(self.url, {"emoji": "❤️"}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_message_from_wrong_trip_404(self):
        other_captain = create_completed_user("wrng-cap@example.com", "wrngcap", "WRG001")
        other_trip = _make_trip(other_captain)
        other_msg = _make_message(other_trip, other_captain)

        response = self.client.post(
            _reactions_url(self.trip.id, other_msg.id),
            {"emoji": "❤️"},
            format="json",
            **_auth(self.member),
        )
        self.assertEqual(response.status_code, 404)

    def test_add_reaction_terminal_trip_returns_409(self):
        self.trip.status = TripStatus.COMPLETED
        self.trip.save(update_fields=["status"])

        response = self.client.post(
            self.url,
            {"emoji": "👍"},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "TRIP_TERMINAL")

    def test_add_reaction_deleted_message_returns_409(self):
        self.message.deleted_for_everyone_at = timezone.now()
        self.message.deleted_for_everyone_by = self.captain
        self.message.save(
            update_fields=["deleted_for_everyone_at", "deleted_for_everyone_by"]
        )

        response = self.client.post(
            self.url,
            {"emoji": "👍"},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "MESSAGE_DELETED")

    def test_all_allowed_emojis_accepted(self):
        # Each emoji from a different user or same user sequentially
        for emoji in ALLOWED_REACTION_EMOJIS:
            response = self.client.post(
                self.url,
                {"emoji": emoji},
                format="json",
                **_auth(self.member),
            )
            self.assertEqual(response.status_code, 201, f"Failed for emoji {emoji!r}")
            # Remove so same user can add next one (would conflict otherwise)
            self.client.delete(
                _reaction_detail_url(self.trip.id, self.message.id, emoji),
                **_auth(self.member),
            )


class MessageReactionAPIRemoveTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("api-rm-cap@example.com", "rmacap", "RMV001")
        self.member = create_completed_user("api-rm-mem@example.com", "rmamem", "RMV002")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)
        self.message = _make_message(self.trip, self.captain)

    def _add_reaction(self, user, emoji):
        MessageReaction.objects.create(message=self.message, user=user, emoji=emoji)

    def test_remove_reaction_200(self):
        self._add_reaction(self.member, "😂")
        url = _reaction_detail_url(self.trip.id, self.message.id, "😂")
        response = self.client.delete(url, **_auth(self.member))
        self.assertEqual(response.status_code, 200)
        self.assertIn("reactions", response.data)
        self.assertEqual(response.data["reactions"], [])

    def test_remove_nonexistent_404(self):
        url = _reaction_detail_url(self.trip.id, self.message.id, "❤️")
        response = self.client.delete(url, **_auth(self.member))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error_code"], "REACTION_NOT_FOUND")

    def test_cannot_remove_others_reaction_404(self):
        self._add_reaction(self.captain, "❤️")
        url = _reaction_detail_url(self.trip.id, self.message.id, "❤️")
        response = self.client.delete(url, **_auth(self.member))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error_code"], "REACTION_NOT_FOUND")
        # Captain's reaction must still exist
        self.assertTrue(MessageReaction.objects.filter(
            message=self.message, user=self.captain, emoji="❤️"
        ).exists())

    def test_invalid_emoji_in_delete_400(self):
        url = _reaction_detail_url(self.trip.id, self.message.id, "🦄")
        response = self.client.delete(url, **_auth(self.member))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error_code"], "INVALID_EMOJI")

    def test_unauthenticated_401(self):
        url = _reaction_detail_url(self.trip.id, self.message.id, "❤️")
        response = self.client.delete(url)
        self.assertEqual(response.status_code, 401)

    def test_remove_reaction_terminal_trip_returns_409(self):
        self._add_reaction(self.member, "👍")
        self.trip.status = TripStatus.CANCELLED
        self.trip.save(update_fields=["status"])

        url = _reaction_detail_url(self.trip.id, self.message.id, "👍")
        response = self.client.delete(url, **_auth(self.member))

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "TRIP_TERMINAL")

    def test_reactions_in_message_history_payload(self):
        """Reactions must appear in chat history responses."""
        self._add_reaction(self.captain, "👍")
        self._add_reaction(self.member, "👍")

        response = self.client.get(
            f"/api/trips/{self.trip.id}/chat/messages",
            **_auth(self.member),
        )
        self.assertEqual(response.status_code, 200)
        results = response.data["results"]
        self.assertEqual(len(results), 1)
        reactions = results[0]["reactions"]
        self.assertEqual(len(reactions), 1)
        self.assertEqual(reactions[0]["emoji"], "👍")
        self.assertEqual(reactions[0]["count"], 2)
