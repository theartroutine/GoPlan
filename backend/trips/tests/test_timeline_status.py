from __future__ import annotations

from datetime import date

from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from test_helpers import create_completed_user
from trips.models import (
    TimelineActivityStatus,
    TimelineLocationMode,
    TimelineSection,
    TripStatus,
)
from trips.tests.timeline_helpers import make_timeline_activity, make_trip_with_timeline


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


class TimelineStatusTests(APITestCase):
    def setUp(self):
        self.captain = create_completed_user("captain-status@example.com", "captain", "CAP001")
        self.assignee = create_completed_user("assignee-status@example.com", "assignee", "ASG001")
        self.member = create_completed_user("member-status@example.com", "member", "MEM001")
        self.trip = make_trip_with_timeline(
            captain=self.captain,
            members=[self.assignee, self.member],
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 3),
            status=TripStatus.ONGOING,
        )
        self.section = TimelineSection.objects.get(trip=self.trip, section_date=date(2026, 6, 1))

    def _status_url(self, activity_id):
        return f"/api/trips/{self.trip.id}/timeline/activities/{activity_id}/status"

    def _timeline_url(self):
        return f"/api/trips/{self.trip.id}/timeline"

    def test_assignee_can_update_allowed_transition(self):
        activity = make_timeline_activity(
            trip=self.trip,
            section=self.section,
            assignee_user=self.assignee,
            status=TimelineActivityStatus.UPCOMING,
        )

        res = self.client.post(
            self._status_url(activity.id),
            {"status": "IN_PROGRESS"},
            format="json",
            **_auth(self.assignee),
        )

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, {"activity_id": str(activity.id), "status": "IN_PROGRESS"})
        activity.refresh_from_db()
        self.assertEqual(activity.status, TimelineActivityStatus.IN_PROGRESS)

    def test_assignee_cannot_cancel_activity(self):
        activity = make_timeline_activity(
            trip=self.trip,
            section=self.section,
            assignee_user=self.assignee,
            status=TimelineActivityStatus.IN_PROGRESS,
        )

        res = self.client.post(
            self._status_url(activity.id),
            {"status": "CANCELLED"},
            format="json",
            **_auth(self.assignee),
        )

        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["error_code"], "PERMISSION_DENIED")
        activity.refresh_from_db()
        self.assertEqual(activity.status, TimelineActivityStatus.IN_PROGRESS)

    def test_non_assignee_member_cannot_update_status(self):
        activity = make_timeline_activity(
            trip=self.trip,
            section=self.section,
            assignee_user=self.assignee,
            status=TimelineActivityStatus.UPCOMING,
        )

        res = self.client.post(
            self._status_url(activity.id),
            {"status": "IN_PROGRESS"},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["error_code"], "PERMISSION_DENIED")

    def test_captain_can_perform_captain_allowed_transition(self):
        activity = make_timeline_activity(
            trip=self.trip,
            section=self.section,
            status=TimelineActivityStatus.UPCOMING,
        )

        res = self.client.post(
            self._status_url(activity.id),
            {"status": "CANCELLED"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(res.status_code, 200)
        activity.refresh_from_db()
        self.assertEqual(activity.status, TimelineActivityStatus.CANCELLED)

    def test_terminal_trip_blocks_status_change(self):
        self.trip.status = TripStatus.COMPLETED
        self.trip.save(update_fields=["status"])
        activity = make_timeline_activity(
            trip=self.trip,
            section=self.section,
            assignee_user=self.assignee,
            status=TimelineActivityStatus.UPCOMING,
        )

        res = self.client.post(
            self._status_url(activity.id),
            {"status": "IN_PROGRESS"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "TRIP_TERMINAL")

    def test_timeline_includes_capabilities_and_location_open_urls(self):
        manual = make_timeline_activity(
            trip=self.trip,
            section=self.section,
            title="Meet at Gate B",
            assignee_user=self.assignee,
            location_mode=TimelineLocationMode.MANUAL,
            location_label="Gate B Bus Station",
        )
        structured = make_timeline_activity(
            trip=self.trip,
            section=self.section,
            title="Museum",
            location_mode=TimelineLocationMode.STRUCTURED,
            location_label="City Museum",
        )
        structured.place_provider = "here"
        structured.place_provider_id = "here:place:1"
        structured.place_title = "City Museum"
        structured.place_address = "Da Lat"
        structured.place_lat = "11.941000"
        structured.place_lng = "108.440000"
        structured.save()

        res = self.client.get(self._timeline_url(), **_auth(self.assignee))

        self.assertEqual(res.status_code, 200)
        activities = {
            item["id"]: item
            for section in res.data["sections"]
            for item in section["activities"]
        }
        self.assertTrue(activities[str(manual.id)]["capabilities"]["can_update_status"])
        self.assertFalse(activities[str(manual.id)]["capabilities"]["can_edit"])
        self.assertIn("Gate%20B%20Bus%20Station", activities[str(manual.id)]["location"]["open_url"])
        self.assertIn("share.here.com/l/11.941,108.44,city-museum", activities[str(structured.id)]["location"]["open_url"])

    def test_assigned_member_status_capability_matches_allowed_transition(self):
        assigned = make_timeline_activity(
            trip=self.trip,
            section=self.section,
            title="Assigned task",
            assignee_user=self.assignee,
            status=TimelineActivityStatus.UPCOMING,
        )
        unassigned = make_timeline_activity(
            trip=self.trip,
            section=self.section,
            title="Unassigned task",
            status=TimelineActivityStatus.UPCOMING,
            position=1,
        )

        res = self.client.get(self._timeline_url(), **_auth(self.assignee))

        self.assertEqual(res.status_code, 200)
        activities = {
            item["id"]: item
            for section in res.data["sections"]
            for item in section["activities"]
        }
        self.assertTrue(activities[str(assigned.id)]["capabilities"]["can_update_status"])
        self.assertFalse(activities[str(unassigned.id)]["capabilities"]["can_update_status"])
