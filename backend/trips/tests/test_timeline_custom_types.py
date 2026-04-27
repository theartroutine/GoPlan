from __future__ import annotations

from datetime import date

from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from test_helpers import create_completed_user
from trips.models import (
    TimelineCustomType,
    TimelineSection,
    TimelineSectionKind,
)
from trips.tests.timeline_helpers import (
    make_timeline_activity,
    make_trip_with_timeline,
)


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


class TimelineCustomTypeTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("captain@example.com", "captain", "CAP001")
        self.member = create_completed_user("member@example.com", "member", "MEM001")
        self.trip = make_trip_with_timeline(
            captain=self.captain,
            members=[self.member],
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 3),
        )

    def _list_url(self):
        return f"/api/trips/{self.trip.id}/timeline/custom-types"

    def _detail_url(self, type_id):
        return f"/api/trips/{self.trip.id}/timeline/custom-types/{type_id}"

    def test_captain_creates_custom_type_201(self):
        res = self.client.post(
            self._list_url(),
            {"name": "Coffee Stop", "color_token": "emerald", "icon_key": "coffee"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["custom_type"]["name"], "Coffee Stop")
        self.assertEqual(res.data["custom_type"]["normalized_name"], "coffee-stop")
        self.assertTrue(res.data["custom_type"]["is_active"])

    def test_member_cannot_create_403(self):
        res = self.client.post(
            self._list_url(), {"name": "Coffee"}, format="json", **_auth(self.member)
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["error_code"], "NOT_CAPTAIN")

    def test_duplicate_name_returns_409(self):
        self.client.post(
            self._list_url(), {"name": "Coffee"}, format="json", **_auth(self.captain)
        )
        res = self.client.post(
            self._list_url(), {"name": "  COFFEE  "}, format="json", **_auth(self.captain)
        )
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "CUSTOM_TYPE_DUPLICATE")

    def test_slug_equivalent_name_returns_409(self):
        self.client.post(
            self._list_url(), {"name": "Coffee Stop"}, format="json", **_auth(self.captain)
        )
        res = self.client.post(
            self._list_url(), {"name": "Coffee-Stop"}, format="json", **_auth(self.captain)
        )
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "CUSTOM_TYPE_DUPLICATE")

    def test_uniqueness_is_per_trip(self):
        TimelineCustomType.objects.create(
            trip=self.trip, name="Coffee", normalized_name="coffee"
        )
        other_trip = make_trip_with_timeline(
            captain=self.captain, name="Other",
            start_date=date(2026, 7, 1), end_date=date(2026, 7, 2),
        )
        res = self.client.post(
            f"/api/trips/{other_trip.id}/timeline/custom-types",
            {"name": "Coffee"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 201)

    def test_patch_rename(self):
        ct = TimelineCustomType.objects.create(
            trip=self.trip, name="Coffee", normalized_name="coffee"
        )
        res = self.client.patch(
            self._detail_url(ct.id),
            {"name": "Coffee & Tea"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["custom_type"]["normalized_name"], "coffee-tea")

    def test_patch_rename_collision_409(self):
        TimelineCustomType.objects.create(
            trip=self.trip, name="Coffee", normalized_name="coffee"
        )
        ct = TimelineCustomType.objects.create(
            trip=self.trip, name="Tea", normalized_name="tea"
        )
        res = self.client.patch(
            self._detail_url(ct.id),
            {"name": "coffee"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 409)

    def test_patch_deactivate(self):
        ct = TimelineCustomType.objects.create(
            trip=self.trip, name="Coffee", normalized_name="coffee"
        )
        res = self.client.patch(
            self._detail_url(ct.id),
            {"is_active": False},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["custom_type"]["is_active"])

    def test_delete_unused_custom_type_200(self):
        ct = TimelineCustomType.objects.create(
            trip=self.trip, name="Coffee", normalized_name="coffee"
        )
        res = self.client.delete(self._detail_url(ct.id), **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        self.assertFalse(TimelineCustomType.objects.filter(pk=ct.id).exists())

    def test_delete_in_use_custom_type_409(self):
        section = TimelineSection.objects.filter(
            trip=self.trip, kind=TimelineSectionKind.SYSTEM_DAY
        ).first()
        ct = TimelineCustomType.objects.create(
            trip=self.trip, name="Coffee", normalized_name="coffee"
        )
        make_timeline_activity(
            trip=self.trip, section=section, title="x",
            system_type="", custom_type=ct,
        )
        res = self.client.delete(self._detail_url(ct.id), **_auth(self.captain))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "CUSTOM_TYPE_IN_USE")
