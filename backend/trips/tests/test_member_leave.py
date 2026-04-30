from datetime import date

from rest_framework.test import APITestCase
from accounts.tokens import AccessToken
from test_helpers import create_completed_user
from trips.models import (
    MemberStatus, TimelineActivityAssigneeScope, TimelineSection,
    Trip, TripMember, TripRole, TripStatus,
)
from trips.tests.timeline_helpers import make_timeline_activity


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _make_trip(captain, status=TripStatus.PLANNING):
    trip = Trip.objects.create(
        created_by=captain, name="T", destination="D",
        start_date="2026-06-01", end_date="2026-06-05", status=status,
    )
    TripMember.objects.create(trip=trip, user=captain, role=TripRole.CAPTAIN, status=MemberStatus.ACTIVE)
    return trip


def _add_member(trip, user):
    return TripMember.objects.create(
        trip=trip, user=user, role=TripRole.MEMBER, status=MemberStatus.ACTIVE
    )


def _leave_url(trip_id):
    return f"/api/trips/{trip_id}/leave"


class LeaveTripTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("cap@example.com", "captain", "CAP001")
        self.member = create_completed_user("mem@example.com", "member", "MEM001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)

    def test_leave_planning_200(self):
        res = self.client.post(_leave_url(self.trip.id), **_auth(self.member))
        self.assertEqual(res.status_code, 200)
        membership = TripMember.objects.get(trip=self.trip, user=self.member)
        self.assertEqual(membership.status, MemberStatus.LEFT)
        self.assertIsNotNone(membership.left_at)

    def test_leave_clears_member_activity_assignees(self):
        section = TimelineSection.objects.create(
            trip=self.trip,
            section_date=date(2026, 6, 1),
            label="Day 1",
            position=0,
        )
        activity = make_timeline_activity(
            trip=self.trip,
            section=section,
            assignee_user=self.member,
        )

        res = self.client.post(_leave_url(self.trip.id), **_auth(self.member))

        self.assertEqual(res.status_code, 200)
        activity.refresh_from_db()
        self.assertEqual(activity.assignee_scope, TimelineActivityAssigneeScope.NONE)
        self.assertIsNone(activity.assignee_user_id)

    def test_leave_ongoing_200(self):
        self.trip.status = TripStatus.ONGOING
        self.trip.save()
        res = self.client.post(_leave_url(self.trip.id), **_auth(self.member))
        self.assertEqual(res.status_code, 200)
        membership = TripMember.objects.get(trip=self.trip, user=self.member)
        self.assertEqual(membership.status, MemberStatus.LEFT)

    def test_captain_cannot_leave_400(self):
        res = self.client.post(_leave_url(self.trip.id), **_auth(self.captain))
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error_code"], "CAPTAIN_CANNOT_LEAVE")

    def test_captain_leave_cancelled_trip_gets_terminal_409(self):
        self.trip.status = TripStatus.CANCELLED
        self.trip.save()
        res = self.client.post(_leave_url(self.trip.id), **_auth(self.captain))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "TRIP_TERMINAL")

    def test_leave_completed_trip_409(self):
        self.trip.status = TripStatus.COMPLETED
        self.trip.save()
        res = self.client.post(_leave_url(self.trip.id), **_auth(self.member))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "TRIP_TERMINAL")

    def test_leave_cancelled_trip_409(self):
        self.trip.status = TripStatus.CANCELLED
        self.trip.save()
        res = self.client.post(_leave_url(self.trip.id), **_auth(self.member))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "TRIP_TERMINAL")

    def test_non_member_cannot_leave_403(self):
        stranger = create_completed_user("stranger@example.com", "stranger", "STR001")
        res = self.client.post(_leave_url(self.trip.id), **_auth(stranger))
        self.assertEqual(res.status_code, 403)

    def test_trip_disappears_from_dashboard_after_leave(self):
        self.client.post(_leave_url(self.trip.id), **_auth(self.member))
        list_res = self.client.get("/api/trips/", **_auth(self.member))
        ids = [t["id"] for t in list_res.data["results"]]
        self.assertNotIn(str(self.trip.id), ids)
