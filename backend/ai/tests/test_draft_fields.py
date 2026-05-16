from __future__ import annotations

from django.test import TestCase

from ai.agent.draft_fields import build_missing_fields_for_create_activity
from test_helpers import create_completed_user
from trips.models import TimelineSection
from trips.services import create_trip


class BuildMissingFieldsForCreateActivityTests(TestCase):
    def setUp(self):
        self.user = create_completed_user(
            "draft-fields@example.com",
            "draftfields",
            "DRF001",
        )
        # Trip with 3 days so sections are created for 2026-06-01, 2026-06-02, 2026-06-03
        self.trip = create_trip(
            captain=self.user,
            name="Draft Fields Trip",
            destination="Hoi An",
            start_date="2026-06-01",
            end_date="2026-06-03",
        )
        sections = list(
            self.trip.timeline_sections.order_by("section_date", "position", "created_at")
        )
        self.section_1 = sections[0]  # 2026-06-01, index 1
        self.section_2 = sections[1]  # 2026-06-02, index 2

    # -------- Happy path: time_range synthetic field --------

    def test_time_range_synthetic_field_includes_section_index_date_and_presets(self):
        fields = build_missing_fields_for_create_activity(
            section_id=self.section_2.id,
            time_mode="TIME_RANGE",
            missing=["start_time", "end_time"],
            system_type="SIGHTSEEING",
        )

        self.assertEqual(len(fields), 1)
        field = fields[0]
        self.assertEqual(field["name"], "time_range")
        self.assertEqual(field["type"], "time_range")
        self.assertTrue(field["required"])

        constraints = field["constraints"]
        self.assertEqual(constraints["section_index"], 2)
        self.assertEqual(constraints["section_date"], "2026-06-02")
        self.assertEqual(constraints["section_id"], str(self.section_2.id))
        self.assertEqual(constraints["pair"], ["start_time", "end_time"])

        preset_labels = [p["label"] for p in field["presets"]]
        self.assertIn("Morning", preset_labels)
        self.assertIn("Afternoon", preset_labels)

    def test_time_range_field_for_first_section_has_index_1(self):
        fields = build_missing_fields_for_create_activity(
            section_id=self.section_1.id,
            time_mode="TIME_RANGE",
            missing=["start_time", "end_time"],
            system_type="DINING",
        )

        self.assertEqual(len(fields), 1)
        self.assertEqual(fields[0]["constraints"]["section_index"], 1)
        self.assertEqual(fields[0]["constraints"]["section_date"], "2026-06-01")

    def test_time_range_field_uses_default_presets_for_other_system_type(self):
        fields = build_missing_fields_for_create_activity(
            section_id=self.section_1.id,
            time_mode="TIME_RANGE",
            missing=["start_time", "end_time"],
            system_type="OTHER",
        )

        preset_labels = {p["label"] for p in fields[0]["presets"]}
        self.assertEqual(preset_labels, {"Morning", "Afternoon", "Evening"})

    def test_time_range_field_uses_default_presets_when_system_type_is_none(self):
        fields = build_missing_fields_for_create_activity(
            section_id=self.section_1.id,
            time_mode="TIME_RANGE",
            missing=["start_time", "end_time"],
            system_type=None,
        )

        preset_labels = {p["label"] for p in fields[0]["presets"]}
        self.assertEqual(preset_labels, {"Morning", "Afternoon", "Evening"})

    # -------- Remaining fields pass through the single-field builder --------

    def test_extra_missing_fields_beside_time_range_are_included(self):
        fields = build_missing_fields_for_create_activity(
            section_id=self.section_1.id,
            time_mode="TIME_RANGE",
            missing=["start_time", "end_time", "title"],
            system_type=None,
        )

        names = [f["name"] for f in fields]
        self.assertIn("time_range", names)
        self.assertIn("title", names)
        self.assertNotIn("start_time", names)
        self.assertNotIn("end_time", names)

    # -------- Non-TIME_RANGE mode --------

    def test_non_time_range_mode_does_not_emit_time_range_field(self):
        fields = build_missing_fields_for_create_activity(
            section_id=self.section_1.id,
            time_mode="FLEXIBLE",
            missing=["title"],
            system_type=None,
        )

        names = [f["name"] for f in fields]
        self.assertNotIn("time_range", names)
        self.assertEqual(names, ["title"])

    def test_non_time_range_mode_with_start_end_times_emits_individual_fields(self):
        fields = build_missing_fields_for_create_activity(
            section_id=self.section_1.id,
            time_mode="FLEXIBLE",
            missing=["start_time", "end_time"],
            system_type=None,
        )

        names = [f["name"] for f in fields]
        self.assertNotIn("time_range", names)
        self.assertIn("start_time", names)
        self.assertIn("end_time", names)

    # -------- Unresolvable section_id --------

    def test_unresolvable_section_id_returns_empty_section_context(self):
        import uuid
        fake_id = uuid.uuid4()

        fields = build_missing_fields_for_create_activity(
            section_id=fake_id,
            time_mode="TIME_RANGE",
            missing=["start_time", "end_time"],
            system_type=None,
        )

        # Field is still emitted
        self.assertEqual(len(fields), 1)
        self.assertEqual(fields[0]["name"], "time_range")

        # But constraints have no section_index / section_date / section_id from DB
        constraints = fields[0]["constraints"]
        self.assertNotIn("section_index", constraints)
        self.assertNotIn("section_date", constraints)
        self.assertNotIn("section_id", constraints)
        # pair is still present
        self.assertEqual(constraints["pair"], ["start_time", "end_time"])

    def test_none_section_id_returns_empty_section_context(self):
        fields = build_missing_fields_for_create_activity(
            section_id=None,
            time_mode="TIME_RANGE",
            missing=["start_time", "end_time"],
            system_type=None,
        )

        self.assertEqual(len(fields), 1)
        constraints = fields[0]["constraints"]
        self.assertNotIn("section_index", constraints)
        self.assertEqual(constraints["pair"], ["start_time", "end_time"])

    # -------- Edge: only one of start_time / end_time missing --------

    def test_only_start_time_missing_does_not_emit_time_range_field(self):
        fields = build_missing_fields_for_create_activity(
            section_id=self.section_1.id,
            time_mode="TIME_RANGE",
            missing=["start_time"],
            system_type=None,
        )

        names = [f["name"] for f in fields]
        self.assertNotIn("time_range", names)
        self.assertIn("start_time", names)

    def test_empty_missing_list_returns_empty_fields(self):
        fields = build_missing_fields_for_create_activity(
            section_id=self.section_1.id,
            time_mode="TIME_RANGE",
            missing=[],
            system_type=None,
        )

        self.assertEqual(fields, [])
