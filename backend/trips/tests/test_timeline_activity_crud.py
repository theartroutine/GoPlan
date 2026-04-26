from __future__ import annotations

from datetime import date

from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from test_helpers import create_completed_user
from trips.models import (
    MemberStatus,
    TimelineActivity,
    TimelineCustomType,
    TimelineSection,
    TimelineSectionKind,
)
from trips.tests.timeline_helpers import (
    make_timeline_activity,
    make_timeline_section,
    make_trip_with_timeline,
)


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


class TimelineActivityCrudTests(APITestCase):

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
        self.section = TimelineSection.objects.filter(
            trip=self.trip, kind=TimelineSectionKind.SYSTEM_DAY
        ).order_by("section_date").first()

    def _create_url(self, section_id=None):
        return f"/api/trips/{self.trip.id}/timeline/sections/{section_id or self.section.id}/activities"

    def _detail_url(self, activity_id):
        return f"/api/trips/{self.trip.id}/timeline/activities/{activity_id}"

    def _reorder_url(self, section_id=None):
        return f"/api/trips/{self.trip.id}/timeline/sections/{section_id or self.section.id}/activities/reorder"

    def _valid_payload(self, **overrides):
        payload = {
            "title": "Bus to Da Lat",
            "time_mode": "AT_TIME",
            "start_time": "06:30:00",
            "system_type": "TRANSPORTATION",
            "location_mode": "MANUAL",
            "location_label": "Bus station",
        }
        payload.update(overrides)
        return payload

    # -------- Create --------

    def test_captain_creates_activity_201(self):
        res = self.client.post(
            self._create_url(), self._valid_payload(), format="json", **_auth(self.captain)
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["activity"]["title"], "Bus to Da Lat")
        self.assertEqual(res.data["activity"]["activity_type"]["code"], "TRANSPORTATION")
        self.assertEqual(res.data["activity"]["position"], 0)

    def test_member_cannot_create_activity_403(self):
        res = self.client.post(
            self._create_url(), self._valid_payload(), format="json", **_auth(self.member)
        )
        self.assertEqual(res.status_code, 403)

    def test_at_time_requires_start_time(self):
        payload = self._valid_payload()
        payload.pop("start_time")
        res = self.client.post(self._create_url(), payload, format="json", **_auth(self.captain))
        self.assertEqual(res.status_code, 400)

    def test_at_time_rejects_end_time(self):
        res = self.client.post(
            self._create_url(),
            self._valid_payload(end_time="08:00:00"),
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)

    def test_all_day_rejects_start_time(self):
        res = self.client.post(
            self._create_url(),
            self._valid_payload(time_mode="ALL_DAY", start_time="06:30:00"),
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)

    def test_time_range_requires_end_after_start(self):
        res = self.client.post(
            self._create_url(),
            self._valid_payload(time_mode="TIME_RANGE", start_time="08:00:00", end_time="06:00:00"),
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)

    def test_must_have_exactly_one_type(self):
        res = self.client.post(
            self._create_url(),
            self._valid_payload(system_type=""),
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)

    def test_structured_location_requires_place(self):
        payload = self._valid_payload(location_mode="STRUCTURED")
        res = self.client.post(self._create_url(), payload, format="json", **_auth(self.captain))
        self.assertEqual(res.status_code, 400)

    def test_manual_location_rejects_place(self):
        payload = self._valid_payload()
        payload["place"] = {
            "provider": "here",
            "provider_id": "x",
            "title": "x",
        }
        res = self.client.post(self._create_url(), payload, format="json", **_auth(self.captain))
        self.assertEqual(res.status_code, 400)

    def test_structured_location_persists_place(self):
        payload = self._valid_payload(location_mode="STRUCTURED")
        payload["place"] = {
            "provider": "here",
            "provider_id": "here:place:1",
            "title": "Bus station",
            "address": "Saigon",
            "lat": "10.84",
            "lng": "106.81",
        }
        res = self.client.post(self._create_url(), payload, format="json", **_auth(self.captain))
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["activity"]["location"]["location_mode"], "STRUCTURED")
        self.assertIsNotNone(res.data["activity"]["location"]["place"])

    def test_assignee_must_be_active_member(self):
        res = self.client.post(
            self._create_url(),
            self._valid_payload(assignee_user_id=str(self.outsider.id)),
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error_code"], "INVALID_ASSIGNEE")

    def test_assignee_active_member_ok(self):
        res = self.client.post(
            self._create_url(),
            self._valid_payload(assignee_user_id=str(self.member.id)),
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["activity"]["assignee"]["id"], str(self.member.id))

    def test_custom_type_must_belong_to_trip(self):
        other_trip = make_trip_with_timeline(captain=self.captain, name="Other", start_date=date(2026, 7, 1), end_date=date(2026, 7, 2))
        ct = TimelineCustomType.objects.create(
            trip=other_trip, name="Coffee", normalized_name="coffee"
        )
        res = self.client.post(
            self._create_url(),
            self._valid_payload(system_type="", custom_type_id=str(ct.id)),
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error_code"], "INVALID_CUSTOM_TYPE")

    # -------- Patch --------

    def test_patch_title(self):
        activity = make_timeline_activity(trip=self.trip, section=self.section, title="x")
        res = self.client.patch(
            self._detail_url(activity.id),
            {"title": "New title"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["activity"]["title"], "New title")

    def test_patch_clears_place_when_switching_to_manual(self):
        activity = make_timeline_activity(
            trip=self.trip, section=self.section, location_mode="STRUCTURED"
        )
        activity.place_provider = "here"
        activity.place_provider_id = "x"
        activity.place_title = "x"
        activity.save()
        res = self.client.patch(
            self._detail_url(activity.id),
            {"location_mode": "MANUAL"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 200)
        activity.refresh_from_db()
        self.assertEqual(activity.place_provider_id, "")
        self.assertIsNone(activity.place_lat)

    def test_patch_validation_failure_400(self):
        activity = make_timeline_activity(
            trip=self.trip, section=self.section, time_mode="AT_TIME"
        )
        res = self.client.patch(
            self._detail_url(activity.id),
            {"time_mode": "TIME_RANGE"},
            format="json",
            **_auth(self.captain),
        )
        # Existing activity has start_time but no end_time → invalid for TIME_RANGE
        self.assertEqual(res.status_code, 400)

    # -------- Delete --------

    def test_delete_activity_200(self):
        activity = make_timeline_activity(trip=self.trip, section=self.section)
        res = self.client.delete(self._detail_url(activity.id), **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        self.assertFalse(TimelineActivity.objects.filter(pk=activity.id).exists())

    # -------- Reorder --------

    def test_reorder_activities_rewrites_positions(self):
        a1 = make_timeline_activity(trip=self.trip, section=self.section, title="a", position=0)
        a2 = make_timeline_activity(trip=self.trip, section=self.section, title="b", position=1)
        a3 = make_timeline_activity(trip=self.trip, section=self.section, title="c", position=2)
        res = self.client.post(
            self._reorder_url(),
            {"ordered_activity_ids": [str(a3.id), str(a1.id), str(a2.id)]},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 200)
        a1.refresh_from_db(); a2.refresh_from_db(); a3.refresh_from_db()
        self.assertEqual(a3.position, 0)
        self.assertEqual(a1.position, 1)
        self.assertEqual(a2.position, 2)

    def test_reorder_activities_invalid_scope_400(self):
        a1 = make_timeline_activity(trip=self.trip, section=self.section, title="a", position=0)
        res = self.client.post(
            self._reorder_url(),
            {"ordered_activity_ids": [str(a1.id), "00000000-0000-0000-0000-000000000000"]},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error_code"], "INVALID_REORDER_SCOPE")
