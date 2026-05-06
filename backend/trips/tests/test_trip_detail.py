from rest_framework.test import APITestCase
from accounts.tokens import AccessToken
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _make_trip(captain, **kwargs):
    defaults = {"name": "T", "destination": "D", "start_date": "2026-06-01", "end_date": "2026-06-05", "status": TripStatus.PLANNING}
    defaults.update(kwargs)
    trip = Trip.objects.create(created_by=captain, **defaults)
    TripMember.objects.create(trip=trip, user=captain, role=TripRole.CAPTAIN, status=MemberStatus.ACTIVE)
    return trip


def _detail_url(trip_id):
    return f"/api/trips/{trip_id}"


class TripDetailTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("captain@example.com", "captain", "CAP001")
        self.member  = create_completed_user("member@example.com", "member", "MEM001")
        self.other   = create_completed_user("other@example.com", "other", "OTH001")
        self.trip = _make_trip(self.captain)
        TripMember.objects.create(trip=self.trip, user=self.member, role=TripRole.MEMBER, status=MemberStatus.ACTIVE)

    def test_detail_200_for_captain(self):
        res = self.client.get(_detail_url(self.trip.id), **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        self.assertIn("trip", res.data)
        self.assertIn("members", res.data)
        self.assertIn("my_membership", res.data)
        self.assertEqual(res.data["my_membership"]["role"], TripRole.CAPTAIN)

    def test_detail_200_for_member(self):
        res = self.client.get(_detail_url(self.trip.id), **_auth(self.member))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["my_membership"]["role"], TripRole.MEMBER)

    def test_detail_404_for_non_member(self):
        res = self.client.get(_detail_url(self.trip.id), **_auth(self.other))
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.data["error_code"], "TRIP_NOT_FOUND")

    def test_detail_404_for_unknown_trip(self):
        import uuid
        res = self.client.get(f"/api/trips/{uuid.uuid4()}", **_auth(self.captain))
        self.assertEqual(res.status_code, 404)
