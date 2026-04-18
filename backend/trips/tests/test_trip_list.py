from __future__ import annotations

from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus

LIST_URL = "/api/trips/"


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _make_trip_with_captain(captain, **kwargs):
    defaults = {
        "name": "Test Trip",
        "destination": "Đà Lạt",
        "start_date": "2026-06-01",
        "end_date": "2026-06-05",
        "currency_code": "VND",
        "status": TripStatus.PLANNING,
    }
    defaults.update(kwargs)
    trip = Trip.objects.create(created_by=captain, **defaults)
    TripMember.objects.create(trip=trip, user=captain, role=TripRole.CAPTAIN, status=MemberStatus.ACTIVE)
    return trip


class TripListTests(APITestCase):

    def setUp(self):
        self.alice = create_completed_user("alice@example.com", "alice", "ALI001")
        self.bob = create_completed_user("bob@example.com", "bob", "BOB001")

    def test_list_only_my_trips_200(self):
        _make_trip_with_captain(self.alice, name="Alice Trip")
        _make_trip_with_captain(self.bob, name="Bob Trip")
        response = self.client.get(LIST_URL, **_auth(self.alice))
        self.assertEqual(response.status_code, 200)
        names = [t["name"] for t in response.data["results"]]
        self.assertIn("Alice Trip", names)
        self.assertNotIn("Bob Trip", names)

    def test_list_includes_cancelled_trips(self):
        _make_trip_with_captain(self.alice, name="Cancelled Trip", status=TripStatus.CANCELLED)
        response = self.client.get(LIST_URL, **_auth(self.alice))
        self.assertEqual(response.status_code, 200)
        names = [t["name"] for t in response.data["results"]]
        self.assertIn("Cancelled Trip", names)

    def test_list_response_has_my_role(self):
        _make_trip_with_captain(self.alice)
        response = self.client.get(LIST_URL, **_auth(self.alice))
        self.assertEqual(response.data["results"][0]["my_role"], TripRole.CAPTAIN)

    def test_list_requires_auth_401(self):
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, 401)
