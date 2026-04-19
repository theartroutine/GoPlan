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

    def test_captain_cannot_patch_completed_trip_409(self):
        self.trip.status = TripStatus.COMPLETED
        self.trip.save()
        res = self.client.patch(self._url(), {"name": "New Name"}, format="json", **_auth(self.captain))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "TRIP_TERMINAL")

    def test_captain_cannot_patch_cancelled_trip_409(self):
        self.trip.status = TripStatus.CANCELLED
        self.trip.save()
        res = self.client.patch(self._url(), {"name": "New Name"}, format="json", **_auth(self.captain))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "TRIP_TERMINAL")

    def test_captain_can_update_place_fields(self):
        res = self.client.patch(
            self._url(),
            {
                "destination": "Tokyo, Japan",
                "destination_place_id": "ChIJtokyo456",
                "destination_lat": "35.689487",
                "destination_lng": "139.691706",
                "destination_country_code": "JP",
                "cover_image_url": "/api/places/photo?ref=places%2FChIJ%2Fphotos%2FXYZ",
            },
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["trip"]["destination_place_id"], "ChIJtokyo456")
        self.assertEqual(res.data["trip"]["destination_country_code"], "JP")
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.destination_place_id, "ChIJtokyo456")
        self.assertEqual(self.trip.destination_country_code, "JP")
        self.assertAlmostEqual(float(self.trip.destination_lat), 35.689487, places=5)
        self.assertAlmostEqual(float(self.trip.destination_lng), 139.691706, places=5)
        self.assertEqual(self.trip.cover_image_url, "/api/places/photo?ref=places%2FChIJ%2Fphotos%2FXYZ")
