from datetime import date, datetime, time, timedelta, timezone

from django.test import SimpleTestCase
from pydantic import ValidationError

from ai.agent.schemas import (
    CreateTimelineActivityArgs,
    CreateExpenseArgs,
    FinalizeSettlementArgs,
    SetExpenseContributionArgs,
    UpdateTimelineActivityStatusArgs,
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

    def test_create_timeline_activity_accepts_section_date_for_uncreated_day(self):
        args = CreateTimelineActivityArgs(
            section_date=date(2026, 7, 3),
            title="X",
            system_type="FOOD",
            time_mode="FLEXIBLE",
        )

        self.assertIsNone(args.section_id)
        self.assertEqual(args.section_date, date(2026, 7, 3))
        self.assertEqual(args.model_dump(mode="json")["section_date"], "2026-07-03")

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

    def test_timeline_activity_status_uses_upcoming_and_maps_legacy_planned(self):
        args = UpdateTimelineActivityStatusArgs(
            activity_id="00000000-0000-0000-0000-000000000001",
            status="UPCOMING",
        )
        legacy = UpdateTimelineActivityStatusArgs(
            activity_id="00000000-0000-0000-0000-000000000001",
            status="PLANNED",
        )

        self.assertEqual(args.status, "UPCOMING")
        self.assertEqual(legacy.status, "UPCOMING")

    def test_set_contribution_accepts_all_paid_scope_without_manual_amounts(self):
        args = SetExpenseContributionArgs(
            expense_id="00000000-0000-0000-0000-000000000001",
            scope="all_participants_paid",
        )

        self.assertEqual(args.scope, "all_participants_paid")
        self.assertIsNone(args.contributions)

    def test_set_contribution_requires_contributions_or_scope(self):
        with self.assertRaises(ValidationError):
            SetExpenseContributionArgs(
                expense_id="00000000-0000-0000-0000-000000000001",
            )

    def test_finalize_settlement_does_not_require_existing_settlement_id(self):
        args = FinalizeSettlementArgs()

        self.assertEqual(args.model_dump(mode="json"), {})

    def test_respond_to_user_message_required(self):
        with self.assertRaises(ValidationError):
            RespondToUserArgs(message="")

    def test_respond_to_user_accepts_detailed_summary(self):
        message = "x" * 3000

        args = RespondToUserArgs(message=message)

        self.assertEqual(args.message, message)

    def test_update_action_draft_requires_draft_id(self):
        with self.assertRaises(ValidationError):
            UpdateActionDraftArgs(fields={"start_time": "08:00"})
