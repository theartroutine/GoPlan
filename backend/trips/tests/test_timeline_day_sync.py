from __future__ import annotations

from datetime import date

from django.test import TestCase

from test_helpers import create_completed_user
from trips.models import TimelineSection
from trips.services import update_trip
from trips.tests.timeline_helpers import make_timeline_activity, make_trip_with_timeline


class TimelineDaySyncTests(TestCase):

    def setUp(self):
        self.captain = create_completed_user(
            "captain-sync@example.com", "captain", "CAP001"
        )

    def test_update_trip_extends_range_and_keeps_only_starter_generated_days(self):
        trip = make_trip_with_timeline(
            captain=self.captain,
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 2),
        )

        update_trip(
            trip,
            start_date=date(2026, 5, 31),
            end_date=date(2026, 6, 3),
        )

        sections = list(TimelineSection.objects.filter(trip=trip).order_by("section_date"))
        self.assertEqual(
            [section.section_date for section in sections],
            [
                date(2026, 5, 31),
                date(2026, 6, 1),
            ],
        )
        self.assertEqual(
            [section.label for section in sections],
            ["Day 1", "Day 2"],
        )
        self.assertTrue(all(not section.is_label_custom for section in sections))

    def test_update_trip_shrink_deletes_empty_generated_outside_days_and_preserves_non_empty_days(self):
        trip = make_trip_with_timeline(
            captain=self.captain,
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 3),
        )
        TimelineSection.objects.create(
            trip=trip,
            section_date=date(2026, 6, 3),
            label="Day 3",
            is_label_custom=False,
            position=0,
        )
        day_with_activity = TimelineSection.objects.get(trip=trip, section_date=date(2026, 6, 1))
        make_timeline_activity(trip=trip, section=day_with_activity, title="Existing booking")

        update_trip(trip, start_date=date(2026, 6, 2), end_date=date(2026, 6, 2))

        day_with_activity.refresh_from_db()
        self.assertEqual(day_with_activity.section_date, date(2026, 6, 1))
        self.assertEqual(day_with_activity.label, "Day 1")
        self.assertTrue(day_with_activity.is_label_custom)
        self.assertTrue(day_with_activity.activities.filter(title="Existing booking").exists())
        self.assertFalse(TimelineSection.objects.filter(trip=trip, section_date=date(2026, 6, 3)).exists())
        remaining_day = TimelineSection.objects.get(trip=trip, section_date=date(2026, 6, 2))
        self.assertEqual(remaining_day.label, "Day 1")

    def test_update_trip_preserves_outside_custom_label(self):
        trip = make_trip_with_timeline(
            captain=self.captain,
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 2),
        )
        custom_day = TimelineSection.objects.get(trip=trip, section_date=date(2026, 6, 2))
        custom_day.label = "Festival day"
        custom_day.is_label_custom = True
        custom_day.save(update_fields=["label", "is_label_custom"])

        update_trip(trip, start_date=date(2026, 6, 1), end_date=date(2026, 6, 1))

        custom_day.refresh_from_db()
        self.assertEqual(custom_day.label, "Festival day")
        self.assertTrue(custom_day.is_label_custom)

    def test_update_trip_reuses_existing_extra_day_when_range_expands_to_date(self):
        trip = make_trip_with_timeline(
            captain=self.captain,
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 1),
        )
        extra_day = TimelineSection.objects.create(
            trip=trip,
            section_date=date(2026, 5, 31),
            label="Arrival buffer",
            is_label_custom=True,
            position=0,
        )
        make_timeline_activity(trip=trip, section=extra_day, title="Pick up supplies")

        update_trip(trip, start_date=date(2026, 5, 31))

        extra_day.refresh_from_db()
        self.assertEqual(extra_day.label, "Arrival buffer")
        self.assertTrue(extra_day.is_label_custom)
        self.assertEqual(TimelineSection.objects.filter(trip=trip, section_date=date(2026, 5, 31)).count(), 1)
        self.assertTrue(extra_day.activities.filter(title="Pick up supplies").exists())
