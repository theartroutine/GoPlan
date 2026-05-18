from datetime import date, datetime, time, timedelta, timezone

from django.test import SimpleTestCase
from pydantic import ValidationError

from ai.agent.schemas import (
    CreateTimelineActivityArgs,
    CreateExpenseArgs,
    FinalizeSettlementArgs,
    SetExpenseContributionArgs,
    UpdateExpenseArgs,
    UpdateTimelineActivityArgs,
    UpdateTimelineActivityStatusArgs,
    UpdateActionDraftArgs,
    RespondToUserArgs,
)


class SchemaTests(SimpleTestCase):
    def test_create_timeline_activity_allows_missing_section_for_needs_info(self):
        args = CreateTimelineActivityArgs(
            title="X",
            system_type="SIGHTSEEING",
            time_mode="FLEXIBLE",
        )

        self.assertIsNone(args.section_id)
        self.assertIsNone(args.section_date)

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

    def test_update_timeline_activity_accepts_local_clock_time_strings(self):
        args = UpdateTimelineActivityArgs(
            activity_id="00000000-0000-0000-0000-000000000001",
            title="Cà phê Chợ Hàn",
            start_time="08:30:00",
            end_time="09:30:00",
        )

        self.assertEqual(args.start_time, time(8, 30))
        self.assertEqual(args.end_time, time(9, 30))
        self.assertEqual(args.model_dump(mode="json")["start_time"], "08:30:00")

    def test_update_timeline_activity_accepts_supported_patch_fields(self):
        args = UpdateTimelineActivityArgs(
            activity_id="00000000-0000-0000-0000-000000000001",
            title="Cà phê Chợ Hàn",
            time_mode="TIME_RANGE",
            system_type="FOOD",
            assignee_scope="USER",
            assignee_user_id="00000000-0000-0000-0000-000000000002",
            start_time="08:30:00",
            end_time="09:30:00",
            location_mode="MANUAL",
            location_label="Chợ Hàn",
            location_note="Cổng chính",
            note="Đi nhẹ nhàng.",
            meeting_point="Lobby khách sạn",
            contact_name="Anh Nam",
            contact_phone="0900000000",
            booking_reference="BOOK-123",
            external_link="https://example.com/booking",
            reminder_offsets_minutes=[30],
        )

        payload = args.model_dump(mode="json", exclude_none=True)
        self.assertEqual(payload["time_mode"], "TIME_RANGE")
        self.assertEqual(payload["system_type"], "FOOD")
        self.assertEqual(payload["assignee_scope"], "USER")
        self.assertEqual(
            payload["assignee_user_id"],
            "00000000-0000-0000-0000-000000000002",
        )
        self.assertEqual(payload["location_mode"], "MANUAL")
        self.assertEqual(payload["location_note"], "Cổng chính")
        self.assertEqual(payload["note"], "Đi nhẹ nhàng.")
        self.assertEqual(payload["meeting_point"], "Lobby khách sạn")
        self.assertEqual(payload["contact_name"], "Anh Nam")
        self.assertEqual(payload["contact_phone"], "0900000000")
        self.assertEqual(payload["booking_reference"], "BOOK-123")
        self.assertEqual(payload["external_link"], "https://example.com/booking")
        self.assertEqual(payload["reminder_offsets_minutes"], [30])

    def test_create_expense_allows_missing_amount_for_needs_info(self):
        args = CreateExpenseArgs(title="X")

        self.assertEqual(args.title, "X")
        self.assertIsNone(args.total_amount)
        self.assertIsNone(args.currency_code)
        self.assertIsNone(args.collector_id)

    def test_update_expense_accepts_description_and_collector(self):
        args = UpdateExpenseArgs(
            expense_id="00000000-0000-0000-0000-000000000001",
            description="Shared seafood dinner",
            collector_id="00000000-0000-0000-0000-000000000002",
        )

        payload = args.model_dump(mode="json", exclude_none=True)
        self.assertEqual(payload["description"], "Shared seafood dinner")
        self.assertEqual(
            payload["collector_id"],
            "00000000-0000-0000-0000-000000000002",
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
