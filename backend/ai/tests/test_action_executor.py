from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from ai.action_types import (
    AI_CONFIRMATION_CAPTAIN,
    AI_CONFIRMATION_TRANSFER_PAYER,
    AI_CONFIRMATION_TRANSFER_RECIPIENT,
)
from ai.agent.executor import (
    AIActionDraftNotReadyError,
    AIActionDraftStaleError,
    _check_preconditions,
    confirm_action_draft,
)
from ai.models import (
    AIActionDraft,
    AIActionDraftStatus,
    AIInteraction,
    AIInteractionStatus,
)
from chat.models import ChatMessage, ChatMessageSenderKind
from expenses.models import Expense, ExpenseContribution
from expenses.services import create_expense, finalize_settlement, set_contribution
from test_helpers import create_completed_user
from trips.models import (
    MemberStatus,
    TimelineActivity,
    TimelineLocationMode,
    TimelineActivityTimeMode,
    TimelineSystemType,
    TripMember,
    TripRole,
)
from trips.services import create_trip


class ActionExecutorTests(TestCase):
    def setUp(self):
        self.captain = create_completed_user(
            "exec-captain@example.com",
            "execcap",
            "EXE001",
        )
        self.trip = create_trip(
            captain=self.captain,
            name="Executor Trip",
            destination="Da Nang",
            start_date="2026-06-01",
            end_date="2026-06-02",
        )
        self.prompt = ChatMessage.objects.create(
            trip=self.trip,
            sender=self.captain,
            sender_display_name_snapshot=self.captain.display_name,
            sender_identify_tag_snapshot=self.captain.identify_tag,
            content="@GoPlanAI create dinner expense",
            client_message_id=uuid4(),
        )
        self.response = ChatMessage.objects.create(
            trip=self.trip,
            sender_kind=ChatMessageSenderKind.AI,
            sender_display_name_snapshot="GoPlanAI",
            content="I prepared a draft.",
        )
        self.interaction = AIInteraction.objects.create(
            trip=self.trip,
            requested_by=self.captain,
            prompt_message=self.prompt,
            prompt="create dinner expense",
            status=AIInteractionStatus.SUCCEEDED,
            lock_expires_at=timezone.now() + timedelta(minutes=2),
        )

    def _expense_create_draft(self):
        return AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="expense.create",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            payload={
                "title": "Dinner",
                "description": "",
                "total_amount": "1200000",
                "collector_id": str(self.captain.id),
            },
            preview={"title": "Dinner"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

    def test_confirm_expense_create_executes_once(self):
        draft = self._expense_create_draft()

        confirmed = confirm_action_draft(
            draft_id=draft.id,
            trip_id=self.trip.id,
            actor=self.captain,
        )

        self.assertEqual(confirmed.status, AIActionDraftStatus.CONFIRMED)
        self.assertEqual(Expense.objects.count(), 1)
        self.assertEqual(confirmed.result["object_type"], "expense")

    def test_confirm_expense_contribution_set_accepts_batch_contributions(self):
        member = create_completed_user(
            "exec-batch-member@example.com",
            "execbatch",
            "EXE003",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Dinner",
            total_amount=Decimal("1200000"),
            collector=self.captain,
        )
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="expense.contribution.set",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            payload={
                "expense_id": str(expense.id),
                "contributions": [
                    {"member_id": str(self.captain.id), "amount": "600000"},
                    {"member_id": str(member.id), "amount": "600000"},
                ],
            },
            preview={"summary": "Everyone paid"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        confirmed = confirm_action_draft(
            draft_id=draft.id,
            trip_id=self.trip.id,
            actor=self.captain,
        )

        contributions = {
            contribution.user_id: contribution.amount
            for contribution in ExpenseContribution.objects.filter(expense=expense)
        }
        self.assertEqual(confirmed.status, AIActionDraftStatus.CONFIRMED)
        self.assertEqual(contributions[self.captain.id], Decimal("600000"))
        self.assertEqual(contributions[member.id], Decimal("600000"))
        self.assertEqual(confirmed.result["object_type"], "expense_contribution_batch")
        self.assertEqual(confirmed.result["updated_count"], 2)

    def test_confirm_expense_contribution_set_accepts_member_contributions_map(self):
        member = create_completed_user(
            "exec-map-member@example.com",
            "execmap",
            "EXE004",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Dinner",
            total_amount=Decimal("1200000"),
            collector=self.captain,
        )
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="expense.contribution.set",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            payload={
                "expense_id": str(expense.id),
                "member_contributions": {
                    str(self.captain.id): {
                        "member_id": str(self.captain.id),
                        "paid_amount": "600000",
                    },
                    str(member.id): {
                        "member_id": str(member.id),
                        "paid_amount": "600000",
                    },
                },
            },
            preview={"summary": "Everyone paid"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        confirmed = confirm_action_draft(
            draft_id=draft.id,
            trip_id=self.trip.id,
            actor=self.captain,
        )

        contributions = {
            contribution.user_id: contribution.amount
            for contribution in ExpenseContribution.objects.filter(expense=expense)
        }
        self.assertEqual(confirmed.status, AIActionDraftStatus.CONFIRMED)
        self.assertEqual(contributions[self.captain.id], Decimal("600000"))
        self.assertEqual(contributions[member.id], Decimal("600000"))
        self.assertEqual(confirmed.result["updated_count"], 2)

    def test_confirm_expense_contribution_set_can_mark_all_participants_paid(self):
        member = create_completed_user(
            "exec-share-member@example.com",
            "execshare",
            "EXE005",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Dinner",
            total_amount=Decimal("1200000"),
            collector=self.captain,
        )
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="expense.contribution.set",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            payload={
                "expense_id": str(expense.id),
                "scope": "all_participants_paid",
            },
            preview={"summary": "Everyone paid"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        confirmed = confirm_action_draft(
            draft_id=draft.id,
            trip_id=self.trip.id,
            actor=self.captain,
        )

        contributions = {
            contribution.user_id: contribution.amount
            for contribution in ExpenseContribution.objects.filter(expense=expense)
        }
        self.assertEqual(contributions[self.captain.id], Decimal("600000"))
        self.assertEqual(contributions[member.id], Decimal("600000"))
        self.assertEqual(confirmed.result["updated_count"], 2)

    def test_double_confirm_does_not_create_duplicate_expense(self):
        draft = self._expense_create_draft()

        confirm_action_draft(
            draft_id=draft.id,
            trip_id=self.trip.id,
            actor=self.captain,
        )
        confirm_action_draft(
            draft_id=draft.id,
            trip_id=self.trip.id,
            actor=self.captain,
        )

        self.assertEqual(Expense.objects.count(), 1)

    def test_stale_expense_update_draft_is_rejected(self):
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Dinner",
            total_amount=Decimal("1200000"),
            collector=self.captain,
        )
        stale_timestamp = expense.updated_at.isoformat()
        expense.title = "Dinner updated elsewhere"
        expense.save(update_fields=["title", "updated_at"])
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="expense.update",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            payload={"expense_id": str(expense.id), "title": "Dinner from AI"},
            preview={"title": "Dinner from AI"},
            missing_fields=[],
            preconditions={
                "target": {
                    "type": "expense",
                    "id": str(expense.id),
                    "updated_at": stale_timestamp,
                }
            },
            expires_at=timezone.now() + timedelta(hours=24),
        )

        with self.assertRaises(AIActionDraftStaleError):
            confirm_action_draft(
                draft_id=draft.id,
                trip_id=self.trip.id,
                actor=self.captain,
            )

    def test_mismatched_stale_precondition_target_is_rejected(self):
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Dinner",
            total_amount=Decimal("1200000"),
            collector=self.captain,
        )
        other_expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Lunch",
            total_amount=Decimal("500000"),
            collector=self.captain,
        )
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="expense.update",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            payload={"expense_id": str(expense.id), "title": "Dinner from AI"},
            preview={"title": "Dinner from AI"},
            missing_fields=[],
            preconditions={
                "target": {
                    "type": "expense",
                    "id": str(other_expense.id),
                    "updated_at": other_expense.updated_at.isoformat(),
                }
            },
            expires_at=timezone.now() + timedelta(hours=24),
        )

        with self.assertRaises(AIActionDraftStaleError):
            confirm_action_draft(
                draft_id=draft.id,
                trip_id=self.trip.id,
                actor=self.captain,
            )

    def test_missing_required_stale_precondition_is_rejected(self):
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Dinner",
            total_amount=Decimal("1200000"),
            collector=self.captain,
        )
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="expense.update",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            payload={"expense_id": str(expense.id), "title": "Dinner from AI"},
            preview={"title": "Dinner from AI"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        with self.assertRaises(AIActionDraftStaleError):
            confirm_action_draft(
                draft_id=draft.id,
                trip_id=self.trip.id,
                actor=self.captain,
            )

    def test_precondition_check_locks_expense_target(self):
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Dinner",
            total_amount=Decimal("1200000"),
            collector=self.captain,
        )
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="expense.update",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            payload={"expense_id": str(expense.id), "title": "Dinner from AI"},
            preview={"title": "Dinner from AI"},
            missing_fields=[],
            preconditions={
                "target": {
                    "type": "expense",
                    "id": str(expense.id),
                    "updated_at": expense.updated_at.isoformat(),
                }
            },
            expires_at=timezone.now() + timedelta(hours=24),
        )

        with patch.object(
            Expense.objects,
            "select_for_update",
            wraps=Expense.objects.select_for_update,
        ) as select_for_update:
            _check_preconditions(draft)

        select_for_update.assert_called_once()

    def test_confirm_missing_required_payload_raises_not_ready(self):
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="timeline.activity.status.update",
            status=AIActionDraftStatus.READY,
            required_confirmation="TIMELINE_ACTIVITY_STATUS",
            payload={"activity_id": "activity-1"},
            preview={"title": "Status update"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        with self.assertRaises(AIActionDraftNotReadyError):
            confirm_action_draft(
                draft_id=draft.id,
                trip_id=self.trip.id,
                actor=self.captain,
            )

    def test_confirm_timeline_activity_create_uses_timeline_service(self):
        section = self.trip.timeline_sections.order_by("section_date").first()
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="timeline.activity.create",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            payload={
                "section_id": str(section.id),
                "data": {
                    "title": "Museum",
                    "time_mode": TimelineActivityTimeMode.FLEXIBLE,
                    "system_type": TimelineSystemType.SIGHTSEEING,
                    "reminder_offsets_minutes": [],
                },
            },
            preview={"title": "Museum"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        confirmed = confirm_action_draft(
            draft_id=draft.id,
            trip_id=self.trip.id,
            actor=self.captain,
        )

        self.assertEqual(confirmed.status, AIActionDraftStatus.CONFIRMED)
        self.assertEqual(TimelineActivity.objects.count(), 1)
        self.assertEqual(confirmed.result["object_type"], "timeline_activity")

    def test_confirm_timeline_activity_create_accepts_structured_location_data(self):
        section = self.trip.timeline_sections.order_by("section_date").first()
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="timeline.activity.create",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            payload={
                "section_id": str(section.id),
                "data": {
                    "title": "Beach walk",
                    "time_mode": TimelineActivityTimeMode.TIME_RANGE,
                    "start_time": "15:30",
                    "end_time": "17:00",
                    "system_type": TimelineSystemType.SIGHTSEEING,
                    "location_mode": TimelineLocationMode.STRUCTURED,
                    "location_label": "Bãi Sau, Vũng Tàu",
                    "place": {
                        "provider": "here",
                        "provider_id": "place-1",
                        "title": "Bãi Sau",
                        "address": "Vũng Tàu",
                        "lat": 10.345,
                        "lng": 107.085,
                    },
                    "reminder_offsets_minutes": [],
                },
            },
            preview={"title": "Beach walk"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        confirmed = confirm_action_draft(
            draft_id=draft.id,
            trip_id=self.trip.id,
            actor=self.captain,
        )

        activity = TimelineActivity.objects.get(pk=confirmed.result["object_id"])
        self.assertEqual(activity.system_type, TimelineSystemType.SIGHTSEEING)
        self.assertEqual(activity.location_mode, TimelineLocationMode.STRUCTURED)
        self.assertEqual(activity.location_label, "Bãi Sau, Vũng Tàu")

    def test_confirm_settlement_finalize_and_reopen_use_expense_services(self):
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Dinner",
            total_amount=Decimal("1200000"),
            collector=self.captain,
        )
        set_contribution(
            trip_id=self.trip.id,
            expense_id=expense.id,
            target_user_id=self.captain.id,
            actor=self.captain,
            amount=Decimal("1200000"),
        )
        finalize_draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="settlement.finalize",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            payload={},
            preview={"title": "Finalize settlement"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        finalized = confirm_action_draft(
            draft_id=finalize_draft.id,
            trip_id=self.trip.id,
            actor=self.captain,
        )

        self.assertEqual(finalized.result["object_type"], "settlement")

        reopen_draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="settlement.reopen",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            payload={},
            preview={"title": "Reopen settlement"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        reopened = confirm_action_draft(
            draft_id=reopen_draft.id,
            trip_id=self.trip.id,
            actor=self.captain,
        )

        self.assertEqual(reopened.result["status"], "REOPENED")

    def test_confirm_transfer_actions_use_transfer_party_permissions(self):
        member = create_completed_user(
            "exec-member@example.com",
            "execmem",
            "EXE002",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Dinner",
            total_amount=Decimal("100000"),
            collector=self.captain,
        )
        set_contribution(
            trip_id=self.trip.id,
            expense_id=expense.id,
            target_user_id=self.captain.id,
            actor=self.captain,
            amount=Decimal("100000"),
        )
        settlement = finalize_settlement(trip_id=self.trip.id, actor=self.captain)
        transfer = settlement.transfers.get()
        mark_sent_draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="settlement.transfer.mark_sent",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_TRANSFER_PAYER,
            payload={"transfer_id": str(transfer.id)},
            preview={"title": "Mark sent"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        marked = confirm_action_draft(
            draft_id=mark_sent_draft.id,
            trip_id=self.trip.id,
            actor=member,
        )

        self.assertEqual(marked.result["object_type"], "settlement_transfer")

        received_draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="settlement.transfer.confirm_received",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_TRANSFER_RECIPIENT,
            payload={"transfer_id": str(transfer.id)},
            preview={"title": "Confirm received"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        received = confirm_action_draft(
            draft_id=received_draft.id,
            trip_id=self.trip.id,
            actor=self.captain,
        )

        self.assertEqual(received.result["object_type"], "settlement_transfer")


class ActionDraftConfirmAPITests(APITestCase):
    def setUp(self):
        self.captain = create_completed_user(
            "confirm-api-captain@example.com",
            "confirmapi",
            "CAP001",
        )
        self.trip = create_trip(
            captain=self.captain,
            name="Confirm API Trip",
            destination="Da Nang",
            start_date="2026-06-01",
            end_date="2026-06-02",
        )
        self.prompt = ChatMessage.objects.create(
            trip=self.trip,
            sender=self.captain,
            sender_display_name_snapshot=self.captain.display_name,
            sender_identify_tag_snapshot=self.captain.identify_tag,
            content="@GoPlanAI update dinner",
            client_message_id=uuid4(),
        )
        self.response = ChatMessage.objects.create(
            trip=self.trip,
            sender_kind=ChatMessageSenderKind.AI,
            sender_display_name_snapshot="GoPlanAI",
            content="I prepared a draft.",
        )
        self.interaction = AIInteraction.objects.create(
            trip=self.trip,
            requested_by=self.captain,
            prompt_message=self.prompt,
            prompt="update dinner",
            status=AIInteractionStatus.SUCCEEDED,
            lock_expires_at=timezone.now() + timedelta(minutes=2),
        )

    def _confirm_url(self, draft_id):
        return f"/api/trips/{self.trip.id}/ai/action-drafts/{draft_id}/confirm"

    def test_stale_confirm_failure_is_persisted_on_draft(self):
        self.client.force_authenticate(self.captain)
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Dinner",
            total_amount=Decimal("1200000"),
            collector=self.captain,
        )
        stale_timestamp = expense.updated_at.isoformat()
        expense.title = "Changed elsewhere"
        expense.save(update_fields=["title", "updated_at"])
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="expense.update",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            payload={"expense_id": str(expense.id), "title": "Dinner from AI"},
            preview={"title": "Dinner from AI"},
            missing_fields=[],
            preconditions={
                "target": {
                    "type": "expense",
                    "id": str(expense.id),
                    "updated_at": stale_timestamp,
                }
            },
            expires_at=timezone.now() + timedelta(hours=24),
        )

        response = self.client.post(self._confirm_url(draft.id))

        self.assertEqual(response.status_code, 409)
        draft.refresh_from_db()
        self.assertEqual(draft.status, AIActionDraftStatus.FAILED)
        self.assertEqual(draft.error_code, "AI_DRAFT_STALE")
        self.assertIn("changed", draft.error_detail)

    def test_confirm_received_before_transfer_sent_does_not_fail_draft(self):
        self.client.force_authenticate(self.captain)
        member = create_completed_user(
            "confirm-api-member@example.com",
            "confirmmem",
            "CAP002",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Dinner",
            total_amount=Decimal("100000"),
            collector=self.captain,
        )
        set_contribution(
            trip_id=self.trip.id,
            expense_id=expense.id,
            target_user_id=self.captain.id,
            actor=self.captain,
            amount=Decimal("100000"),
        )
        settlement = finalize_settlement(trip_id=self.trip.id, actor=self.captain)
        transfer = settlement.transfers.get()
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response,
            requested_by=self.captain,
            action_type="settlement.transfer.confirm_received",
            status=AIActionDraftStatus.READY,
            required_confirmation=AI_CONFIRMATION_TRANSFER_RECIPIENT,
            payload={"transfer_id": str(transfer.id)},
            preview={"title": "Confirm received"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        response = self.client.post(self._confirm_url(draft.id))

        self.assertEqual(response.status_code, 403)
        draft.refresh_from_db()
        self.assertEqual(draft.status, AIActionDraftStatus.READY)
        self.assertEqual(draft.error_code, "")
