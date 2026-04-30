from __future__ import annotations

from datetime import date

from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from test_helpers import create_completed_user
from trips.models import (
    MemberStatus,
    TimelineActivityTimeMode,
    TimelineLocationMode,
    TripStatus,
)
from trips.models import TimelineSection
from trips.tests.timeline_helpers import make_timeline_activity, make_trip_with_timeline


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


class TimelineDetailTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("captain@example.com", "captain", "CAP001")
        self.member = create_completed_user("member@example.com", "member", "MEM001")
        self.outsider = create_completed_user("out@example.com", "out", "OUT001")
        self.trip = make_trip_with_timeline(
            captain=self.captain,
            members=[self.member],
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 3),
        )

    def _url(self, trip_id=None):
        return f"/api/trips/{trip_id or self.trip.id}/timeline"

    def test_captain_gets_200_with_timeline_days_and_metadata(self):
        res = self.client.get(self._url(), **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        data = res.data
        self.assertEqual(data["trip_timezone"], "Asia/Ho_Chi_Minh")
        self.assertTrue(data["permissions"]["can_edit_timeline"])
        self.assertTrue(data["permissions"]["can_manage_custom_types"])
        self.assertEqual(len(data["system_types"]), 8)
        self.assertEqual(data["system_types"][0]["code"], "TRANSPORTATION")
        self.assertEqual(data["system_types"][-1]["code"], "OTHER")
        self.assertEqual(len(data["sections"]), 2)
        for idx, section in enumerate(data["sections"]):
            self.assertNotIn("kind", section)
            self.assertEqual(section["label"], f"Day {idx + 1}")
            self.assertEqual(section["position"], 0)
            self.assertTrue(section["is_in_trip_range"])
            self.assertEqual(section["activities"], [])

    def test_member_gets_200_but_cannot_edit(self):
        res = self.client.get(self._url(), **_auth(self.member))
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["permissions"]["can_edit_timeline"])
        self.assertFalse(res.data["permissions"]["can_manage_custom_types"])

    def test_non_member_gets_403(self):
        res = self.client.get(self._url(), **_auth(self.outsider))
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["error_code"], "NOT_TRIP_MEMBER")

    def test_unknown_trip_returns_404(self):
        res = self.client.get(self._url(trip_id="00000000-0000-0000-0000-000000000000"), **_auth(self.captain))
        self.assertEqual(res.status_code, 404)

    def test_terminal_trip_disables_edit_capabilities(self):
        self.trip.status = TripStatus.COMPLETED
        self.trip.save(update_fields=["status"])
        res = self.client.get(self._url(), **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["permissions"]["can_edit_timeline"])

    def test_activities_render_with_assignee_and_type(self):
        section = TimelineSection.objects.get(
            trip=self.trip,
            section_date=self.trip.start_date,
        )
        make_timeline_activity(
            trip=self.trip,
            section=section,
            title="Bus to Da Lat",
            time_mode=TimelineActivityTimeMode.AT_TIME,
            assignee_user=self.member,
            system_type="TRANSPORTATION",
            location_mode=TimelineLocationMode.MANUAL,
            location_label="Mien Dong terminal",
        )
        res = self.client.get(self._url(), **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        day_one = next(s for s in res.data["sections"] if s["section_date"] == "2026-06-01")
        self.assertNotIn("kind", day_one)
        self.assertEqual(len(day_one["activities"]), 1)
        activity = day_one["activities"][0]
        self.assertEqual(activity["title"], "Bus to Da Lat")
        self.assertEqual(activity["activity_type"]["code"], "TRANSPORTATION")
        self.assertEqual(activity["assignee"]["display_name"], self.member.display_name)
        self.assertEqual(activity["location"]["location_mode"], "MANUAL")
        self.assertIsNone(activity["location"]["place"])
