from __future__ import annotations

from datetime import date

from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from test_helpers import create_completed_user
from trips.models import (
    TimelineSection,
    TripStatus,
)
from trips.tests.timeline_helpers import (
    make_timeline_activity,
    make_timeline_section,
    make_trip_with_timeline,
)


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


class TimelineSectionCrudTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("captain@example.com", "captain", "CAP001")
        self.member = create_completed_user("member@example.com", "member", "MEM001")
        self.trip = make_trip_with_timeline(
            captain=self.captain,
            members=[self.member],
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 3),
        )

    def _sections_url(self):
        return f"/api/trips/{self.trip.id}/timeline/sections"

    def _detail_url(self, section_id):
        return f"/api/trips/{self.trip.id}/timeline/sections/{section_id}"

    def _reorder_url(self):
        return f"/api/trips/{self.trip.id}/timeline/sections/reorder"

    # -------- Create --------

    def test_captain_creates_extra_day_201(self):
        res = self.client.post(
            self._sections_url(),
            {"section_date": "2026-05-31", "label": "Day 0 - Preparation"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 201)
        section = res.data["section"]
        self.assertNotIn("kind", section)
        self.assertEqual(section["section_date"], "2026-05-31")
        self.assertEqual(section["label"], "Day 0 - Preparation")
        self.assertTrue(section["is_label_custom"])
        self.assertEqual(section["position"], 0)
        self.assertFalse(section["is_in_trip_range"])

    def test_create_day_rejects_existing_date(self):
        res = self.client.post(
            self._sections_url(),
            {"section_date": "2026-06-01", "label": "Morning special"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "SECTION_DATE_CONFLICT")

    def test_member_cannot_create_section_403(self):
        res = self.client.post(
            self._sections_url(),
            {"section_date": "2026-05-31", "label": "Day 0"},
            format="json",
            **_auth(self.member),
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["error_code"], "NOT_CAPTAIN")

    def test_terminal_trip_blocks_section_create_409(self):
        self.trip.status = TripStatus.COMPLETED
        self.trip.save()
        res = self.client.post(
            self._sections_url(),
            {"section_date": "2026-05-31", "label": "Day 0"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "TRIP_TERMINAL")

    # -------- Patch --------

    def test_patch_generated_day_label_marks_custom(self):
        section = TimelineSection.objects.get(trip=self.trip, section_date=date(2026, 6, 1))
        res = self.client.patch(
            self._detail_url(section.id),
            {"label": "Arrival and check-in"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("kind", res.data["section"])
        self.assertTrue(res.data["section"]["is_label_custom"])
        self.assertEqual(res.data["section"]["label"], "Arrival and check-in")

    def test_patch_generated_day_to_free_outside_date_marks_custom_and_recreates_missing_day(self):
        section = TimelineSection.objects.get(trip=self.trip, section_date=date(2026, 6, 1))

        res = self.client.patch(
            self._detail_url(section.id),
            {"section_date": "2026-05-31"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(res.status_code, 200)
        self.assertNotIn("kind", res.data["section"])
        self.assertEqual(res.data["section"]["section_date"], "2026-05-31")
        self.assertEqual(res.data["section"]["label"], "Day 1")
        self.assertTrue(res.data["section"]["is_label_custom"])
        self.assertFalse(res.data["section"]["is_in_trip_range"])
        recreated = TimelineSection.objects.get(trip=self.trip, section_date=date(2026, 6, 1))
        self.assertNotEqual(recreated.id, section.id)
        self.assertEqual(recreated.label, "Day 1")
        self.assertFalse(recreated.is_label_custom)

    def test_patch_generated_day_to_missing_in_range_date_updates_generated_label(self):
        target = TimelineSection.objects.get(trip=self.trip, section_date=date(2026, 6, 2))
        target.delete()
        source = TimelineSection.objects.get(trip=self.trip, section_date=date(2026, 6, 1))

        res = self.client.patch(
            self._detail_url(source.id),
            {"section_date": "2026-06-02"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(res.status_code, 200)
        self.assertNotIn("kind", res.data["section"])
        self.assertEqual(res.data["section"]["section_date"], "2026-06-02")
        self.assertEqual(res.data["section"]["label"], "Day 2")
        self.assertFalse(res.data["section"]["is_label_custom"])
        self.assertTrue(res.data["section"]["is_in_trip_range"])
        recreated_source = TimelineSection.objects.get(trip=self.trip, section_date=date(2026, 6, 1))
        self.assertNotEqual(recreated_source.id, source.id)
        self.assertEqual(recreated_source.label, "Day 1")
        self.assertFalse(recreated_source.is_label_custom)

    def test_patch_custom_day_with_generated_label_clears_custom(self):
        section = TimelineSection.objects.get(trip=self.trip, section_date=date(2026, 6, 1))
        section.label = "Arrival and check-in"
        section.is_label_custom = True
        section.save(update_fields=["label", "is_label_custom"])

        res = self.client.patch(
            self._detail_url(section.id),
            {"label": "Day 1"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("kind", res.data["section"])
        self.assertEqual(res.data["section"]["label"], "Day 1")
        self.assertFalse(res.data["section"]["is_label_custom"])
        section.refresh_from_db()
        self.assertEqual(section.label, "Day 1")
        self.assertFalse(section.is_label_custom)

    def test_patch_extra_day_allows_section_date(self):
        section = make_timeline_section(
            trip=self.trip,
            section_date=date(2026, 5, 30),
            label="Day -1",
            position=0,
        )
        res = self.client.patch(
            self._detail_url(section.id),
            {"section_date": "2026-05-31", "label": "Pre-trip"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("kind", res.data["section"])
        self.assertEqual(res.data["section"]["section_date"], "2026-05-31")
        self.assertEqual(res.data["section"]["label"], "Pre-trip")

    # -------- Delete --------

    def test_delete_empty_section_200(self):
        section = make_timeline_section(
            trip=self.trip, section_date=date(2026, 5, 30), label="x", position=0
        )
        res = self.client.delete(self._detail_url(section.id), **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        self.assertFalse(TimelineSection.objects.filter(pk=section.id).exists())

    def test_delete_non_empty_section_409(self):
        section = make_timeline_section(
            trip=self.trip, section_date=date(2026, 5, 30), label="x", position=0
        )
        make_timeline_activity(trip=self.trip, section=section, title="a")
        res = self.client.delete(self._detail_url(section.id), **_auth(self.captain))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "SECTION_NOT_EMPTY")

    def test_member_cannot_delete_section_403(self):
        section = make_timeline_section(
            trip=self.trip, section_date=date(2026, 5, 30), label="x", position=0
        )
        res = self.client.delete(self._detail_url(section.id), **_auth(self.member))
        self.assertEqual(res.status_code, 403)

    def test_delete_empty_in_range_day_recreates_required_generated_day(self):
        section = TimelineSection.objects.get(trip=self.trip, section_date=date(2026, 6, 1))

        res = self.client.delete(self._detail_url(section.id), **_auth(self.captain))

        self.assertEqual(res.status_code, 200)
        self.assertFalse(TimelineSection.objects.filter(pk=section.id).exists())
        recreated = TimelineSection.objects.get(trip=self.trip, section_date=date(2026, 6, 1))
        self.assertEqual(recreated.label, "Day 1")
        self.assertFalse(recreated.is_label_custom)

    # -------- Reorder --------

    def test_reorder_sections_rewrites_positions(self):
        day = TimelineSection.objects.get(trip=self.trip, section_date=date(2026, 6, 1))
        day.position = 4
        day.save(update_fields=["position"])

        res = self.client.post(
            self._reorder_url(),
            {
                "section_date": "2026-06-01",
                "ordered_section_ids": [str(day.id)],
            },
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["sections"]), 1)
        self.assertNotIn("kind", res.data["sections"][0])
        self.assertEqual(res.data["sections"][0]["section_date"], "2026-06-01")
        self.assertEqual(res.data["sections"][0]["position"], 0)
        self.assertTrue(res.data["sections"][0]["is_in_trip_range"])
        day.refresh_from_db()
        self.assertEqual(day.position, 0)

    def test_reorder_sections_missing_id_400(self):
        s1 = make_timeline_section(
            trip=self.trip, section_date=date(2026, 5, 31), label="a", position=0
        )
        res = self.client.post(
            self._reorder_url(),
            {"section_date": "2026-06-01", "ordered_section_ids": [str(s1.id)]},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error_code"], "INVALID_REORDER_SCOPE")
