from rest_framework.test import APITestCase
from accounts.tokens import AccessToken
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _make_trip(captain):
    trip = Trip.objects.create(created_by=captain, name="Old Name", destination="Old Dest",
                               start_date="2026-06-01", end_date="2026-06-05", status=TripStatus.PLANNING)
    TripMember.objects.create(trip=trip, user=captain, role=TripRole.CAPTAIN, status=MemberStatus.ACTIVE)
    return trip


class UpdateTripTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("captain@example.com", "captain", "CAP001")
        self.member  = create_completed_user("member@example.com", "member", "MEM001")
        self.trip = _make_trip(self.captain)
        TripMember.objects.create(trip=self.trip, user=self.member, role=TripRole.MEMBER, status=MemberStatus.ACTIVE)

    def _url(self):
        return f"/api/trips/{self.trip.id}"

    def test_captain_can_update_name(self):
        res = self.client.patch(self._url(), {"name": "New Name"}, format="json", **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["trip"]["name"], "New Name")

    def test_member_cannot_update_403(self):
        res = self.client.patch(self._url(), {"name": "Hacked"}, format="json", **_auth(self.member))
        self.assertEqual(res.status_code, 403)

    def test_update_end_before_start_400(self):
        res = self.client.patch(self._url(), {"end_date": "2026-01-01"}, format="json", **_auth(self.captain))
        self.assertEqual(res.status_code, 400)

    def test_captain_can_update_budget(self):
        res = self.client.patch(self._url(), {"budget_estimate": "5000000.00"}, format="json", **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["trip"]["budget_estimate"], "5000000.00")
