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

    def test_create_trip_with_destination_provider_fields_201(self):
        payload = {
            "name": "Đà Lạt Trip",
            "destination": "Đà Lạt, Lâm Đồng, Vietnam",
            "destination_provider": "here",
            "destination_provider_id": "here:cm:namedplace:123",
            "destination_lat": "11.940298",
            "destination_lng": "108.458397",
            "destination_country_code": "VN",
            "cover_image_url": "/media/trip-covers/abc.jpg",
            "start_date": "2026-06-01",
            "end_date": "2026-06-05",
        }
        response = self.client.post(CREATE_URL, payload, format="json", **_auth(self.user))
        self.assertEqual(response.status_code, 201)
        trip_data = response.data["trip"]
        self.assertEqual(trip_data["destination_provider"], "here")
        self.assertEqual(trip_data["destination_provider_id"], "here:cm:namedplace:123")
        self.assertEqual(trip_data["destination_country_code"], "VN")
        self.assertEqual(trip_data["cover_image_url"], "/media/trip-covers/abc.jpg")
        trip = Trip.objects.get(pk=trip_data["id"])
        self.assertEqual(trip.destination_provider, "here")
        self.assertEqual(trip.destination_provider_id, "here:cm:namedplace:123")
        self.assertEqual(trip.destination_country_code, "VN")
        self.assertEqual(trip.cover_image_url, "/media/trip-covers/abc.jpg")

    def test_create_trip_persists_timezone(self):
        payload = {
            "name": "Tokyo Trip",
            "destination": "Tokyo",
            "start_date": "2026-09-01",
            "end_date": "2026-09-03",
            "timezone": "Asia/Tokyo",
        }
        response = self.client.post(CREATE_URL, payload, format="json", **_auth(self.user))
        self.assertEqual(response.status_code, 201)
        trip = Trip.objects.get(pk=response.data["trip"]["id"])
        self.assertEqual(trip.timezone, "Asia/Tokyo")

    def test_create_trip_default_timezone_when_omitted(self):
        payload = {
            "name": "Default TZ",
            "destination": "Hue",
            "start_date": "2026-08-01",
            "end_date": "2026-08-02",
        }
        response = self.client.post(CREATE_URL, payload, format="json", **_auth(self.user))
        self.assertEqual(response.status_code, 201)
        trip = Trip.objects.get(pk=response.data["trip"]["id"])
        self.assertEqual(trip.timezone, "Asia/Ho_Chi_Minh")

    def test_create_trip_invalid_timezone_400(self):
        payload = {
            "name": "Bad TZ",
            "destination": "Hue",
            "start_date": "2026-08-01",
            "end_date": "2026-08-02",
            "timezone": "Mars/Olympus",
        }
        response = self.client.post(CREATE_URL, payload, format="json", **_auth(self.user))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data,
            {"detail": "Invalid trip timezone.", "error_code": "INVALID_TIMEZONE"},
        )

    def test_create_trip_seeds_system_day_sections(self):
        payload = {
            "name": "Seed Days",
            "destination": "Hoi An",
            "start_date": "2026-10-01",
            "end_date": "2026-10-03",
        }
        response = self.client.post(CREATE_URL, payload, format="json", **_auth(self.user))
        self.assertEqual(response.status_code, 201)
        trip = Trip.objects.get(pk=response.data["trip"]["id"])
        sections = list(trip.timeline_sections.order_by("section_date"))
        self.assertEqual(len(sections), 3)
        self.assertEqual([s.label for s in sections], ["Day 1", "Day 2", "Day 3"])
        for section in sections:
            self.assertFalse(section.is_label_custom)
            self.assertEqual(section.position, 0)

    def test_create_trip_without_destination_provider_fields_still_201(self):
        """Backward compatibility: creating without structured destination fields must still work."""
        payload = {
            "name": "Old Style Trip",
            "destination": "Hà Nội",
            "start_date": "2026-07-01",
            "end_date": "2026-07-03",
        }
        response = self.client.post(CREATE_URL, payload, format="json", **_auth(self.user))
        self.assertEqual(response.status_code, 201)
        trip_data = response.data["trip"]
        self.assertEqual(trip_data["destination_provider"], "")
        self.assertEqual(trip_data["destination_provider_id"], "")
        self.assertIsNone(trip_data["destination_lat"])
        self.assertEqual(trip_data["cover_image_url"], "")
        trip = Trip.objects.get(pk=trip_data["id"])
        self.assertEqual(trip.destination_provider, "")
        self.assertEqual(trip.destination_provider_id, "")
        self.assertIsNone(trip.destination_lat)
        self.assertEqual(trip.cover_image_url, "")
