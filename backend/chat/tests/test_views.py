from __future__ import annotations

from uuid import uuid4

from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

from accounts.tokens import AccessToken
from chat.models import ChatMessage
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _make_trip(captain, *, status=TripStatus.PLANNING):
    trip = Trip.objects.create(
        created_by=captain,
        name="Chat API Trip",
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


def _messages_url(trip_id):
    return f"/api/trips/{trip_id}/chat/messages"


class TripChatMessagesAPITests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("api-cap@example.com", "apicap", "ACA001")
        self.member = create_completed_user("api-mem@example.com", "apimem", "AME001")
        self.other = create_completed_user("api-other@example.com", "apiother", "AOT001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)

    def test_post_creates_message_201(self):
        client_message_id = uuid4()

        response = self.client.post(
            _messages_url(self.trip.id),
            {"content": "Hello API", "client_message_id": str(client_message_id)},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["message"]["content"], "Hello API")
        self.assertEqual(
            response.data["message"]["client_message_id"],
            str(client_message_id),
        )

    def test_post_idempotent_retry_returns_200(self):
        client_message_id = uuid4()
        payload = {"content": "Hello once", "client_message_id": str(client_message_id)}
        first = self.client.post(
            _messages_url(self.trip.id),
            payload,
            format="json",
            **_auth(self.member),
        )
        second = self.client.post(
            _messages_url(self.trip.id),
            {"content": "Hello twice", "client_message_id": str(client_message_id)},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["message"]["id"], second.data["message"]["id"])
        self.assertEqual(ChatMessage.objects.count(), 1)

    def test_post_non_member_returns_404(self):
        response = self.client.post(
            _messages_url(self.trip.id),
            {"content": "No access", "client_message_id": str(uuid4())},
            format="json",
            **_auth(self.other),
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error_code"], "TRIP_NOT_FOUND")

    def test_post_terminal_trip_returns_409(self):
        self.trip.status = TripStatus.CANCELLED
        self.trip.save(update_fields=["status"])

        response = self.client.post(
            _messages_url(self.trip.id),
            {"content": "Nope", "client_message_id": str(uuid4())},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "TRIP_TERMINAL")

    def test_post_idempotent_retry_after_terminal_returns_existing_200(self):
        client_message_id = uuid4()
        payload = {
            "content": "Created before terminal",
            "client_message_id": str(client_message_id),
        }
        first = self.client.post(
            _messages_url(self.trip.id),
            payload,
            format="json",
            **_auth(self.member),
        )
        self.trip.status = TripStatus.COMPLETED
        self.trip.save(update_fields=["status"])

        second = self.client.post(
            _messages_url(self.trip.id),
            {
                "content": "Retry after terminal",
                "client_message_id": str(client_message_id),
            },
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["message"]["id"], second.data["message"]["id"])
        self.assertEqual(second.data["message"]["content"], "Created before terminal")
        self.assertEqual(ChatMessage.objects.count(), 1)

    def test_post_invalid_content_returns_400(self):
        response = self.client.post(
            _messages_url(self.trip.id),
            {"content": "   ", "client_message_id": str(uuid4())},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error_code"], "INVALID_CONTENT")

    def test_get_history_for_active_member(self):
        self.client.post(
            _messages_url(self.trip.id),
            {"content": "History", "client_message_id": str(uuid4())},
            format="json",
            **_auth(self.member),
        )

        response = self.client.get(_messages_url(self.trip.id), **_auth(self.member))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["content"], "History")
        self.assertIn("next_cursor", response.data)

    def test_get_terminal_trip_history_allowed(self):
        ChatMessage.objects.create(
            trip=self.trip,
            sender=self.member,
            sender_display_name_snapshot=self.member.display_name,
            sender_identify_tag_snapshot=self.member.identify_tag,
            content="Old",
            client_message_id=uuid4(),
        )
        self.trip.status = TripStatus.COMPLETED
        self.trip.save(update_fields=["status"])

        response = self.client.get(_messages_url(self.trip.id), **_auth(self.member))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["content"], "Old")

    def test_get_non_member_returns_404(self):
        response = self.client.get(_messages_url(self.trip.id), **_auth(self.other))

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error_code"], "TRIP_NOT_FOUND")

    def test_get_invalid_query_returns_error_code(self):
        response = self.client.get(
            f"{_messages_url(self.trip.id)}?limit=0",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error_code"], "INVALID_QUERY")


class TripChatThrottleTests(APITestCase):

    def test_chat_send_throttle_returns_error_code(self):
        original_rates = ScopedRateThrottle.THROTTLE_RATES
        ScopedRateThrottle.THROTTLE_RATES = {"chat_send": "2/minute"}
        self.addCleanup(setattr, ScopedRateThrottle, "THROTTLE_RATES", original_rates)

        captain = create_completed_user("throttle-cap@example.com", "thrcap", "TCA001")
        member = create_completed_user("throttle-mem@example.com", "thrmem", "TME001")
        trip = _make_trip(captain)
        _add_member(trip, member)

        for index in range(2):
            response = self.client.post(
                _messages_url(trip.id),
                {"content": f"Message {index}", "client_message_id": str(uuid4())},
                format="json",
                **_auth(member),
            )
            self.assertEqual(response.status_code, 201)

        throttled = self.client.post(
            _messages_url(trip.id),
            {"content": "Message 3", "client_message_id": str(uuid4())},
            format="json",
            **_auth(member),
        )

        self.assertEqual(throttled.status_code, 429)
        self.assertEqual(throttled.data["error_code"], "THROTTLED")
