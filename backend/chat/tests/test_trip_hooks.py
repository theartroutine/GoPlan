from __future__ import annotations

from unittest.mock import patch

from rest_framework.test import APITestCase

from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus
from trips.services import leave_trip, remove_member


def _make_trip(captain):
    trip = Trip.objects.create(
        created_by=captain,
        name="Hook Trip",
        destination="Da Nang",
        start_date="2026-06-01",
        end_date="2026-06-05",
        status=TripStatus.PLANNING,
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


class TripChatMembershipHookTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("hook-cap@example.com", "hookcap", "HCA001")
        self.member = create_completed_user("hook-mem@example.com", "hookmem", "HME001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)

    def test_remove_member_notifies_chat_kick(self):
        with patch("chat.services.notify_trip_chat_member_removed") as mock_notify:
            remove_member(self.trip.id, self.member.id, self.captain)

        mock_notify.assert_called_once_with(
            trip_id=self.trip.id,
            user_id=self.member.id,
        )

    def test_leave_trip_notifies_chat_kick(self):
        with patch("chat.services.notify_trip_chat_member_removed") as mock_notify:
            leave_trip(self.trip.id, self.member)

        mock_notify.assert_called_once_with(
            trip_id=self.trip.id,
            user_id=self.member.id,
        )
