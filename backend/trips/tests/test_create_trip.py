from __future__ import annotations

from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus

CREATE_URL = "/api/trips/"


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


class CreateTripTests(APITestCase):

    def setUp(self):
        self.user = create_completed_user("captain@example.com", "captain", "CAP001")

    def test_create_trip_201(self):
        payload = {
            "name": "Đà Lạt 2026",
            "destination": "Đà Lạt",
            "start_date": "2026-06-01",
            "end_date": "2026-06-05",
        }
        response = self.client.post(CREATE_URL, payload, format="json", **_auth(self.user))
        self.assertEqual(response.status_code, 201)
        data = response.data
        self.assertIn("trip", data)
        self.assertEqual(data["trip"]["name"], "Đà Lạt 2026")
        self.assertEqual(data["trip"]["status"], TripStatus.PLANNING)
        # Creator must be ACTIVE CAPTAIN
        trip = Trip.objects.get(pk=data["trip"]["id"])
        self.assertTrue(
            TripMember.objects.filter(
                trip=trip, user=self.user, role=TripRole.CAPTAIN, status=MemberStatus.ACTIVE
            ).exists()
        )

    def test_create_trip_with_optional_fields_201(self):
        payload = {
            "name": "Beach Trip",
            "destination": "Nha Trang",
            "start_date": "2026-07-01",
            "end_date": "2026-07-03",
            "description": "Summer vibes",
            "currency_code": "USD",
            "budget_estimate": "5000000.00",
        }
        response = self.client.post(CREATE_URL, payload, format="json", **_auth(self.user))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["trip"]["currency_code"], "USD")

    def test_create_trip_end_before_start_400(self):
        payload = {
            "name": "Bad Dates",
            "destination": "Somewhere",
            "start_date": "2026-06-05",
            "end_date": "2026-06-01",
        }
        response = self.client.post(CREATE_URL, payload, format="json", **_auth(self.user))
        self.assertEqual(response.status_code, 400)

    def test_create_trip_requires_auth_401(self):
        payload = {"name": "X", "destination": "Y", "start_date": "2026-01-01", "end_date": "2026-01-02"}
        response = self.client.post(CREATE_URL, payload, format="json")
        self.assertEqual(response.status_code, 401)

    def test_create_trip_missing_required_fields_400(self):
        response = self.client.post(CREATE_URL, {"name": "No Dest"}, format="json", **_auth(self.user))
        self.assertEqual(response.status_code, 400)

    def test_create_trip_with_place_fields_201(self):
        payload = {
            "name": "Đà Lạt Trip",
            "destination": "Đà Lạt, Lâm Đồng, Vietnam",
            "destination_place_id": "ChIJtest123",
            "destination_lat": "11.940298",
            "destination_lng": "108.458397",
            "destination_country_code": "VN",
            "cover_image_url": "/api/places/photo?ref=places%2FChIJ%2Fphotos%2FABC",
            "start_date": "2026-06-01",
            "end_date": "2026-06-05",
        }
        response = self.client.post(CREATE_URL, payload, format="json", **_auth(self.user))
        self.assertEqual(response.status_code, 201)
        trip_data = response.data["trip"]
        self.assertEqual(trip_data["destination_place_id"], "ChIJtest123")
        self.assertEqual(trip_data["destination_country_code"], "VN")
        self.assertIsNotNone(trip_data["cover_image_url"])

    def test_create_trip_without_place_fields_still_201(self):
        """Backward compatibility: creating without place fields must still work."""
        payload = {
            "name": "Old Style Trip",
            "destination": "Hà Nội",
            "start_date": "2026-07-01",
            "end_date": "2026-07-03",
        }
        response = self.client.post(CREATE_URL, payload, format="json", **_auth(self.user))
        self.assertEqual(response.status_code, 201)
        trip_data = response.data["trip"]
        self.assertEqual(trip_data["destination_place_id"], "")
        self.assertIsNone(trip_data["destination_lat"])
        self.assertEqual(trip_data["cover_image_url"], "")
