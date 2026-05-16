from datetime import datetime, time, timedelta, timezone

from django.test import SimpleTestCase
from pydantic import ValidationError

from ai.agent.schemas import (
    CreateTimelineActivityArgs,
    CreateExpenseArgs,
    UpdateActionDraftArgs,
    RespondToUserArgs,
)


class SchemaTests(SimpleTestCase):
    def test_create_timeline_activity_requires_section_id(self):
        with self.assertRaises(ValidationError):
            CreateTimelineActivityArgs(title="X", system_type="SIGHTSEEING", time_mode="FLEXIBLE")

    def test_create_timeline_activity_uses_current_timeline_enums(self):
        args = CreateTimelineActivityArgs(
            section_id="00000000-0000-0000-0000-000000000001",
            title="X",
            system_type="FOOD",
            time_mode="FLEXIBLE",
        )

        self.assertEqual(args.system_type, "FOOD")
        self.assertEqual(args.time_mode, "FLEXIBLE")
        self.assertEqual(args.assignee_scope, "EVERYONE")

    def test_activity_time_serializes_datetime_as_local_clock_time(self):
        args = CreateTimelineActivityArgs(
            section_id="00000000-0000-0000-0000-000000000001",
            title="X",
            system_type="SIGHTSEEING",
            time_mode="TIME_RANGE",
            start_time="2026-04-20T15:45:00+07:00",
            end_time="2026-04-20T17:30:00+07:00",
        )

        self.assertEqual(args.start_time, time(15, 45))
        self.assertEqual(args.end_time, time(17, 30))
        self.assertEqual(args.model_dump(mode="json")["start_time"], "15:45:00")

    def test_time_range_end_after_start(self):
        start = datetime(2026, 4, 20, 10, 0, tzinfo=timezone.utc)
        end = start - timedelta(hours=1)
        with self.assertRaises(ValidationError):
            CreateTimelineActivityArgs(
                section_id="00000000-0000-0000-0000-000000000001",
                title="X",
                system_type="SIGHTSEEING",
                time_mode="TIME_RANGE",
                start_time=start,
                end_time=end,
            )

    def test_create_expense_amount_must_be_positive(self):
        with self.assertRaises(ValidationError):
            CreateExpenseArgs(
                title="X",
                total_amount="0",
                currency_code="VND",
                collector_id="00000000-0000-0000-0000-000000000001",
            )

    def test_respond_to_user_message_required(self):
        with self.assertRaises(ValidationError):
            RespondToUserArgs(message="")

    def test_update_action_draft_requires_draft_id(self):
        with self.assertRaises(ValidationError):
            UpdateActionDraftArgs(fields={"start_time": "08:00"})
