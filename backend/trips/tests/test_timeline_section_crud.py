from __future__ import annotations

from datetime import date

from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from test_helpers import create_completed_user
from trips.models import (
    TimelineSection,
    TimelineSectionKind,
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

    def test_captain_creates_special_section_201(self):
        res = self.client.post(
            self._sections_url(),
            {"section_date": "2026-05-31", "label": "Day 0 - Preparation"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 201)
        section = res.data["section"]
        self.assertEqual(section["kind"], TimelineSectionKind.SPECIAL_DAY)
        self.assertTrue(section["is_label_custom"])
        self.assertEqual(section["position"], 0)

    def test_create_section_rejects_existing_system_day_date(self):
        res = self.client.post(
            self._sections_url(),
            {"section_date": "2026-06-01", "label": "Morning special"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "SECTION_DATE_CONFLICT")

    def test_create_section_rejects_existing_special_day_date(self):
        make_timeline_section(
            trip=self.trip,
            section_date=date(2026, 5, 31),
            label="Day 0 - Preparation",
            position=0,
        )
        res = self.client.post(
            self._sections_url(),
            {"section_date": "2026-05-31", "label": "Backup plan"},
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

    def test_patch_system_day_label_marks_custom(self):
        section = TimelineSection.objects.filter(
            trip=self.trip, kind=TimelineSectionKind.SYSTEM_DAY
        ).first()
        res = self.client.patch(
            self._detail_url(section.id),
            {"label": "Arrival and check-in"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["section"]["is_label_custom"])
        self.assertEqual(res.data["section"]["label"], "Arrival and check-in")

    def test_patch_system_day_section_date_rejected(self):
        section = TimelineSection.objects.filter(
            trip=self.trip, kind=TimelineSectionKind.SYSTEM_DAY
        ).first()
        res = self.client.patch(
            self._detail_url(section.id),
            {"section_date": "2026-07-01"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error_code"], "SYSTEM_DAY_LOCKED")

    def test_patch_system_day_label_back_to_generated_clears_custom(self):
        section = TimelineSection.objects.filter(
            trip=self.trip, kind=TimelineSectionKind.SYSTEM_DAY
        ).order_by("section_date").first()
        section.label = "Custom"
        section.is_label_custom = True
        section.save()
        res = self.client.patch(
            self._detail_url(section.id),
            {"label": "Day 1"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["section"]["is_label_custom"])

    def test_patch_special_day_allows_section_date(self):
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
        self.assertEqual(res.data["section"]["section_date"], "2026-05-31")
        self.assertEqual(res.data["section"]["label"], "Pre-trip")

    def test_patch_special_day_rejects_existing_section_date(self):
        section = make_timeline_section(
            trip=self.trip,
            section_date=date(2026, 5, 30),
            label="Pre-trip",
            position=0,
        )
        res = self.client.patch(
            self._detail_url(section.id),
            {"section_date": "2026-06-01"},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "SECTION_DATE_CONFLICT")

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

    # -------- Reorder --------

    def test_reorder_sections_rewrites_positions(self):
        sys_day = TimelineSection.objects.get(
            trip=self.trip, section_date=date(2026, 6, 1), kind=TimelineSectionKind.SYSTEM_DAY
        )
        sys_day.position = 4
        sys_day.save(update_fields=["position"])
        res = self.client.post(
            self._reorder_url(),
            {
                "section_date": "2026-06-01",
                "ordered_section_ids": [str(sys_day.id)],
            },
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 200)
        sys_day.refresh_from_db()
        self.assertEqual(sys_day.position, 0)

    def test_reorder_sections_requires_ids_400(self):
        res = self.client.post(
            self._reorder_url(),
            {"section_date": "2026-06-01", "ordered_section_ids": []},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("ordered_section_ids", res.data)
