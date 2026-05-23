from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from ai.agent.tools import TOOLS, openai_tool_params, resolve_tool


class ToolRegistryTests(SimpleTestCase):
    def test_registry_includes_all_expected_tools(self):
        names = {t.name for t in TOOLS}
        self.assertIn("create_timeline_activity", names)
        self.assertIn("create_expense", names)
        self.assertIn("update_action_draft", names)
        self.assertIn("respond_to_user", names)

    def test_openai_tool_params_round_trip(self):
        params = openai_tool_params()
        self.assertEqual(len(params), len(TOOLS))
        for p in params:
            self.assertEqual(p["type"], "function")
            self.assertIn("name", p["function"])
            self.assertIn("parameters", p["function"])

    def test_resolve_tool_returns_handler(self):
        tool = resolve_tool("create_timeline_activity")
        self.assertEqual(tool.name, "create_timeline_activity")
        self.assertTrue(callable(tool.handler))


class ToolHandlerTests(TestCase):
    def setUp(self):
        from chat.models import ChatMessage
        from ai.models import AIInteraction, AIInteractionStatus
        from test_helpers import create_completed_user
        from trips.services import create_trip

        self.user = create_completed_user(
            "tool-handler@example.com",
            "toolhandler",
            "TH001",
        )
        self.trip = create_trip(
            captain=self.user,
            name="Tool Handler Trip",
            destination="Hanoi",
            start_date="2026-07-01",
            end_date="2026-07-03",
        )
        self.prompt_message = ChatMessage.objects.create(
            trip=self.trip,
            sender=self.user,
            sender_display_name_snapshot=self.user.display_name,
            sender_identify_tag_snapshot=self.user.identify_tag,
            content="@GoPlanAI add activity",
            client_message_id=uuid4(),
        )
        self.interaction = AIInteraction.objects.create(
            trip=self.trip,
            requested_by=self.user,
            prompt_message=self.prompt_message,
            prompt="add activity",
            status=AIInteractionStatus.RUNNING,
            lock_expires_at=timezone.now() + timedelta(minutes=5),
        )

    def test_create_timeline_activity_persists_draft(self):
        from ai.agent import handlers, schemas
        from ai.models import AIActionDraft

        section_id = uuid4()
        result = handlers.create_timeline_activity(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.CreateTimelineActivityArgs(
                section_id=section_id,
                title="X",
                system_type="SIGHTSEEING",
                time_mode="FLEXIBLE",
            ),
        )
        self.assertIsInstance(result.draft, AIActionDraft)
        self.assertEqual(result.draft.action_type, "timeline.activity.create")
        self.assertEqual(
            result.draft.payload,
            {
                "section_id": str(section_id),
                "data": {
                    "title": "X",
                    "system_type": "SIGHTSEEING",
                    "time_mode": "FLEXIBLE",
                    "assignee_scope": "EVERYONE",
                },
            },
        )
        self.assertEqual(result.draft.display["icon"], "activity")

    def test_create_timeline_activity_persists_section_date_for_uncreated_day(self):
        from ai.agent import handlers, schemas
        from ai.models import AIActionDraft

        result = handlers.create_timeline_activity(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.CreateTimelineActivityArgs(
                section_date=date(2026, 7, 3),
                title="X",
                system_type="SIGHTSEEING",
                time_mode="FLEXIBLE",
            ),
        )

        self.assertIsInstance(result.draft, AIActionDraft)
        self.assertEqual(result.draft.action_type, "timeline.activity.create")
        self.assertEqual(
            result.draft.payload,
            {
                "section_date": "2026-07-03",
                "data": {
                    "title": "X",
                    "system_type": "SIGHTSEEING",
                    "time_mode": "FLEXIBLE",
                    "assignee_scope": "EVERYONE",
                },
            },
        )

    def test_update_timeline_activity_persists_nested_patch_data(self):
        from ai.agent import handlers, schemas
        from ai.models import AIActionDraft

        section = self.trip.timeline_sections.order_by("section_date").first()
        activity = section.activities.create(
            trip=self.trip,
            title="Old stop",
            time_mode="FLEXIBLE",
            system_type="SIGHTSEEING",
        )
        result = handlers.update_timeline_activity(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.UpdateTimelineActivityArgs(
                activity_id=activity.id,
                title="Updated stop",
            ),
        )

        self.assertIsInstance(result.draft, AIActionDraft)
        self.assertEqual(result.draft.action_type, "timeline.activity.update")
        self.assertEqual(
            result.draft.payload,
            {
                "activity_id": str(activity.id),
                "data": {
                    "title": "Updated stop",
                },
            },
        )
        self.assertEqual(
            result.draft.preconditions["target"]["id"],
            str(activity.id),
        )

    def test_update_timeline_activity_persists_extended_patch_data(self):
        from ai.agent import handlers, schemas

        section = self.trip.timeline_sections.order_by("section_date").first()
        activity = section.activities.create(
            trip=self.trip,
            title="Old stop",
            time_mode="FLEXIBLE",
            system_type="SIGHTSEEING",
        )
        result = handlers.update_timeline_activity(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.UpdateTimelineActivityArgs(
                activity_id=activity.id,
                note="Bring cash.",
                meeting_point="Hotel lobby",
                reminder_offsets_minutes=[30],
            ),
        )

        self.assertEqual(
            result.draft.payload,
            {
                "activity_id": str(activity.id),
                "data": {
                    "note": "Bring cash.",
                    "meeting_point": "Hotel lobby",
                    "reminder_offsets_minutes": [30],
                },
            },
        )

    def test_update_expense_persists_description_and_collector(self):
        from ai.agent import handlers, schemas
        from expenses.services import create_expense

        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.user,
            title="Lunch",
            description="Old",
            total_amount=Decimal("2000000"),
            collector_id=self.user.id,
        )
        result = handlers.update_expense(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.UpdateExpenseArgs(
                expense_id=expense.id,
                description="Updated description",
                collector_id=self.user.id,
            ),
        )

        self.assertEqual(result.draft.action_type, "expense.update")
        self.assertEqual(
            result.draft.payload,
            {
                "expense_id": str(expense.id),
                "target_title": "Lunch",
                "description": "Updated description",
                "collector_id": str(self.user.id),
            },
        )

    def test_set_expense_contribution_persists_target_precondition(self):
        from ai.agent import handlers, schemas
        from ai.models import AIActionDraft
        from expenses.services import create_expense

        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.user,
            title="Lunch",
            description="",
            total_amount=Decimal("2000000"),
            collector_id=self.user.id,
        )

        result = handlers.set_expense_contribution(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.SetExpenseContributionArgs(
                expense_id=expense.id,
                contributions=[
                    {
                        "user_id": str(self.user.id),
                        "amount": "2000000",
                    },
                ],
            ),
        )

        self.assertIsInstance(result.draft, AIActionDraft)
        self.assertEqual(result.draft.action_type, "expense.contribution.set")
        self.assertEqual(
            result.draft.preconditions["target"]["id"],
            str(expense.id),
        )
        self.assertEqual(
            result.draft.preconditions["target"]["type"],
            "expense",
        )

    def test_set_expense_contribution_scope_persists_all_paid_payload(self):
        from ai.agent import handlers, schemas
        from expenses.services import create_expense

        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.user,
            title="Lunch",
            description="",
            total_amount=Decimal("100003"),
            collector_id=self.user.id,
        )

        result = handlers.set_expense_contribution(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.SetExpenseContributionArgs(
                expense_id=expense.id,
                scope="all_participants_paid",
            ),
        )

        self.assertEqual(result.draft.payload["scope"], "all_participants_paid")
        self.assertNotIn("contributions", result.draft.payload)

    def test_transfer_handler_enriches_display_payload_from_transfer(self):
        from ai.agent import handlers, schemas
        from expenses.services import (
            create_expense,
            finalize_settlement,
            set_contribution,
        )
        from trips.models import MemberStatus, TripMember, TripRole
        from test_helpers import create_completed_user

        member = create_completed_user(
            "tool-transfer-member@example.com",
            "tooltransfer",
            "TH002",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.user,
            title="Hotel",
            description="",
            total_amount=Decimal("900000"),
            collector_id=self.user.id,
        )
        set_contribution(
            trip_id=self.trip.id,
            expense_id=expense.id,
            target_user_id=self.user.id,
            amount=Decimal("900000"),
            actor=self.user,
        )
        set_contribution(
            trip_id=self.trip.id,
            expense_id=expense.id,
            target_user_id=member.id,
            amount=Decimal("0"),
            actor=self.user,
        )
        settlement = finalize_settlement(trip_id=self.trip.id, actor=self.user)
        transfer = settlement.transfers.get()

        result = handlers.mark_transfer_sent(
            trip=self.trip,
            interaction=self.interaction,
            actor=member,
            args=schemas.MarkTransferSentArgs(transfer_id=transfer.id),
        )

        self.assertEqual(result.draft.payload["amount"], "450000.00")
        self.assertEqual(result.draft.payload["currency_code"], "VND")
        self.assertEqual(result.draft.payload["from_name"], member.display_name)
        self.assertEqual(result.draft.payload["to_name"], self.user.display_name)
        self.assertEqual(result.draft.display["hero"]["value"], "450,000")
        self.assertEqual(
            result.draft.display["meta"],
            [
                {"label": "From", "value": member.display_name},
                {"label": "To", "value": self.user.display_name},
            ],
        )

    def test_finalize_settlement_skips_draft_when_trip_already_finalized(self):
        from ai.agent import handlers, schemas
        from ai.models import AIActionDraft
        from expenses.services import (
            create_expense,
            finalize_settlement,
            set_contribution,
        )

        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.user,
            title="Hotel",
            description="",
            total_amount=Decimal("1000000"),
            collector_id=self.user.id,
        )
        set_contribution(
            trip_id=self.trip.id,
            expense_id=expense.id,
            target_user_id=self.user.id,
            amount=Decimal("1000000"),
            actor=self.user,
        )
        finalize_settlement(trip_id=self.trip.id, actor=self.user)

        result = handlers.finalize_settlement(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.FinalizeSettlementArgs(),
        )

        self.assertIsNone(result.draft)
        self.assertIn("đã được quyết toán", result.message)
        self.assertFalse(
            AIActionDraft.objects.filter(action_type="settlement.finalize").exists()
        )

    def test_finalize_settlement_skips_draft_when_expenses_are_underfunded(self):
        from ai.agent import handlers, schemas
        from ai.models import AIActionDraft
        from expenses.services import create_expense

        create_expense(
            trip_id=self.trip.id,
            actor=self.user,
            title="Hotel",
            description="",
            total_amount=Decimal("1000000"),
            collector_id=self.user.id,
        )

        result = handlers.finalize_settlement(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.FinalizeSettlementArgs(),
        )

        self.assertIsNone(result.draft)
        self.assertIn("Chưa thể chốt quyết toán", result.message)
        self.assertIn("1000000.00 VND", result.message)
        self.assertFalse(
            AIActionDraft.objects.filter(action_type="settlement.finalize").exists()
        )

    def test_delete_activity_handler_enriches_display_payload_from_target(self):
        from ai.agent import handlers, schemas

        section = self.trip.timeline_sections.order_by("section_date").first()
        activity = section.activities.create(
            trip=self.trip,
            title="Dragon Bridge photo walk",
            time_mode="FLEXIBLE",
            system_type="SIGHTSEEING",
        )

        result = handlers.delete_timeline_activity(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.DeleteTimelineActivityArgs(activity_id=activity.id),
        )

        self.assertEqual(result.draft.payload["title"], "Dragon Bridge photo walk")
        self.assertEqual(result.draft.display["title"], "Dragon Bridge photo walk")

    def test_delete_expense_handler_enriches_display_payload_from_target(self):
        from ai.agent import handlers, schemas
        from expenses.services import create_expense

        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.user,
            title="Hotel deposit",
            description="",
            total_amount=Decimal("1000000"),
            collector_id=self.user.id,
        )

        result = handlers.delete_expense(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.DeleteExpenseArgs(expense_id=expense.id),
        )

        self.assertEqual(result.draft.payload["title"], "Hotel deposit")
        self.assertEqual(result.draft.payload["total_amount"], "1000000.00")
        self.assertEqual(result.draft.display["title"], "Hotel deposit")
        self.assertEqual(result.draft.display["hero"]["value"], "1,000,000")

    def test_respond_to_user_returns_message_without_draft(self):
        from ai.agent import handlers, schemas

        result = handlers.respond_to_user(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.RespondToUserArgs(message="hello"),
        )
        self.assertIsNone(result.draft)
        self.assertEqual(result.message, "hello")
