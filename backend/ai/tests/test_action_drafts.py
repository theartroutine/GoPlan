from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from ai.action_types import (
    AI_CONFIRMATION_CAPTAIN,
    AI_CONFIRMATION_TRANSFER_PAYER,
)
from ai.agent.drafts import build_action_draft_payload
from ai.models import (
    AIActionDraft,
    AIActionDraftStatus,
    AIInteraction,
    AIInteractionStatus,
)
from chat.models import ChatMessage, ChatMessageSenderKind
from test_helpers import create_completed_user
from trips.models import MemberStatus, TripMember, TripRole
from trips.services import create_trip


class AIActionDraftModelTests(TestCase):
    def setUp(self):
        self.user = create_completed_user(
            "agent-draft@example.com",
            "agentdraft",
            "AID001",
        )
        self.trip = create_trip(
            captain=self.user,
            name="Agent Draft Trip",
            destination="Da Nang",
            start_date="2026-06-01",
            end_date="2026-06-03",
        )
        self.prompt_message = ChatMessage.objects.create(
            trip=self.trip,
            sender=self.user,
            sender_display_name_snapshot=self.user.display_name,
            sender_identify_tag_snapshot=self.user.identify_tag,
            content="@GoPlanAI add dinner expense",
            client_message_id=uuid4(),
        )
        self.response_message = ChatMessage.objects.create(
            trip=self.trip,
            sender_kind=ChatMessageSenderKind.AI,
            sender_display_name_snapshot="GoPlanAI",
            content="I prepared a draft.",
        )
        self.interaction = AIInteraction.objects.create(
            trip=self.trip,
            requested_by=self.user,
            prompt_message=self.prompt_message,
            prompt="add dinner expense",
            status=AIInteractionStatus.SUCCEEDED,
            lock_expires_at=timezone.now() + timedelta(minutes=2),
        )

    def test_action_draft_persists_preview_and_payload(self):
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response_message,
            requested_by=self.user,
            action_type="expense.create",
            status=AIActionDraftStatus.READY,
            payload={"title": "Dinner", "total_amount": "1200000"},
            preview={"title": "Dinner", "amount": "1,200,000 VND"},
            missing_fields=[],
            preconditions={},
            required_confirmation="CAPTAIN",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        self.assertEqual(str(draft.trip_id), str(self.trip.id))
        self.assertEqual(draft.status, AIActionDraftStatus.READY)
        self.assertEqual(draft.payload["title"], "Dinner")
        self.assertEqual(draft.preview["amount"], "1,200,000 VND")

    def test_indexes_exist_for_trip_status_expiry_and_response_message(self):
        index_names = {index.name for index in AIActionDraft._meta.indexes}
        self.assertIn("ai_draft_trip_status_exp_idx", index_names)
        self.assertIn("ai_draft_response_idx", index_names)


class AIActionDraftPayloadTests(AIActionDraftModelTests):
    def test_captain_can_confirm_captain_managed_draft(self):
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response_message,
            requested_by=self.user,
            action_type="expense.create",
            status=AIActionDraftStatus.READY,
            payload={"title": "Dinner"},
            preview={"title": "Dinner"},
            missing_fields=[],
            preconditions={},
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            expires_at=timezone.now() + timedelta(hours=24),
        )

        payload = build_action_draft_payload(draft, viewer=self.user)

        self.assertTrue(payload["can_confirm"])
        self.assertTrue(payload["can_cancel"])

    def test_member_cannot_confirm_captain_managed_draft(self):
        member = create_completed_user(
            "agent-member@example.com",
            "agentmember",
            "AID002",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response_message,
            requested_by=member,
            action_type="expense.create",
            status=AIActionDraftStatus.READY,
            payload={"title": "Dinner"},
            preview={"title": "Dinner"},
            missing_fields=[],
            preconditions={},
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            expires_at=timezone.now() + timedelta(hours=24),
        )

        payload = build_action_draft_payload(draft, viewer=member)

        self.assertFalse(payload["can_confirm"])
        self.assertTrue(payload["can_cancel"])

    def test_assignee_can_confirm_timeline_status_update_draft(self):
        member = create_completed_user(
            "agent-status-member@example.com",
            "agentstatus",
            "AID003",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        section = self.trip.timeline_sections.order_by("section_date").first()
        activity = section.activities.create(
            trip=self.trip,
            title="Museum",
            time_mode="FLEXIBLE",
            assignee_scope="USER",
            assignee_user=member,
            position=0,
        )
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response_message,
            requested_by=member,
            action_type="timeline.activity.status.update",
            status=AIActionDraftStatus.READY,
            payload={"activity_id": str(activity.id), "status": "IN_PROGRESS"},
            preview={"title": "Museum", "status": "IN_PROGRESS"},
            missing_fields=[],
            preconditions={},
            required_confirmation="TIMELINE_ACTIVITY_STATUS",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        payload = build_action_draft_payload(draft, viewer=member)

        self.assertTrue(payload["can_confirm"])

    def test_malformed_transfer_id_cannot_break_draft_payload_rendering(self):
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response_message,
            requested_by=self.user,
            action_type="settlement.transfer.mark_sent",
            status=AIActionDraftStatus.READY,
            payload={"transfer_id": "not-a-uuid"},
            preview={"transfer_id": "not-a-uuid"},
            missing_fields=[],
            preconditions={},
            required_confirmation=AI_CONFIRMATION_TRANSFER_PAYER,
            expires_at=timezone.now() + timedelta(hours=24),
        )

        payload = build_action_draft_payload(draft, viewer=self.user)

        self.assertFalse(payload["can_confirm"])

    def test_missing_section_field_includes_select_options(self):
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response_message,
            requested_by=self.user,
            action_type="timeline.activity.create",
            status=AIActionDraftStatus.NEEDS_INFO,
            payload={"data": {"title": "Museum", "time_mode": "FLEXIBLE"}},
            preview={"title": "Museum"},
            missing_fields=[{"name": "section_id", "label": "Timeline day"}],
            preconditions={},
            required_confirmation=AI_CONFIRMATION_CAPTAIN,
            expires_at=timezone.now() + timedelta(hours=24),
        )

        payload = build_action_draft_payload(draft, viewer=self.user)

        section_field = payload["missing_fields"][0]
        self.assertEqual(section_field["type"], "select")
        self.assertEqual(
            section_field["options"][0]["value"],
            str(self.trip.timeline_sections.order_by("section_date").first().id),
        )


class AIActionDraftAPITests(APITestCase, AIActionDraftModelTests):
    def _detail_url(self, draft_id):
        return f"/api/trips/{self.trip.id}/ai/action-drafts/{draft_id}"

    def _cancel_url(self, draft_id):
        return f"/api/trips/{self.trip.id}/ai/action-drafts/{draft_id}/cancel"

    def test_captain_reads_action_draft_detail(self):
        self.client.force_authenticate(self.user)
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response_message,
            requested_by=self.user,
            action_type="expense.create",
            status=AIActionDraftStatus.READY,
            required_confirmation="CAPTAIN",
            payload={"title": "Dinner"},
            preview={"title": "Dinner"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        response = self.client.get(self._detail_url(draft.id))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["draft"]["id"], str(draft.id))
        self.assertTrue(response.data["draft"]["can_confirm"])

    def test_requester_can_cancel_own_draft(self):
        self.client.force_authenticate(self.user)
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response_message,
            requested_by=self.user,
            action_type="expense.create",
            status=AIActionDraftStatus.READY,
            required_confirmation="CAPTAIN",
            payload={"title": "Dinner"},
            preview={"title": "Dinner"},
            missing_fields=[],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        response = self.client.post(self._cancel_url(draft.id))

        self.assertEqual(response.status_code, 200)
        draft.refresh_from_db()
        self.assertEqual(draft.status, AIActionDraftStatus.CANCELLED)
        self.assertEqual(draft.cancelled_by_id, self.user.id)


class AIActionDraftPatchTests(APITestCase, AIActionDraftModelTests):
    def test_requester_patches_missing_fields_and_draft_becomes_ready(self):
        self.client.force_authenticate(self.user)
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response_message,
            requested_by=self.user,
            action_type="expense.create",
            status=AIActionDraftStatus.NEEDS_INFO,
            required_confirmation="CAPTAIN",
            payload={"title": "Lunch"},
            preview={"title": "Lunch"},
            missing_fields=[{"name": "total_amount", "label": "Amount"}],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        response = self.client.patch(
            f"/api/trips/{self.trip.id}/ai/action-drafts/{draft.id}",
            {
                "payload": {
                    "total_amount": "500000",
                    "collector_id": str(self.user.id),
                }
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        draft.refresh_from_db()
        self.assertEqual(draft.status, AIActionDraftStatus.READY)
        self.assertEqual(draft.payload["total_amount"], "500000")
        self.assertEqual(draft.preview["total_amount"], "500000")
        self.assertEqual(response.data["draft"]["preview"]["total_amount"], "500000")
        self.assertEqual(draft.missing_fields, [])

    def test_patch_keeps_legacy_string_missing_field_until_value_is_present(self):
        self.client.force_authenticate(self.user)
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response_message,
            requested_by=self.user,
            action_type="expense.create",
            status=AIActionDraftStatus.NEEDS_INFO,
            required_confirmation="CAPTAIN",
            payload={"title": "Lunch"},
            preview={"title": "Lunch"},
            missing_fields=["total_amount"],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        response = self.client.patch(
            f"/api/trips/{self.trip.id}/ai/action-drafts/{draft.id}",
            {"payload": {"description": "Team lunch"}},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        draft.refresh_from_db()
        self.assertEqual(draft.status, AIActionDraftStatus.NEEDS_INFO)
        self.assertEqual(
            draft.missing_fields,
            [{"name": "total_amount", "label": "Amount", "type": "money"}],
        )

    def test_patch_timeline_create_missing_data_field_updates_nested_payload(self):
        self.client.force_authenticate(self.user)
        section = self.trip.timeline_sections.order_by("section_date").first()
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response_message,
            requested_by=self.user,
            action_type="timeline.activity.create",
            status=AIActionDraftStatus.NEEDS_INFO,
            required_confirmation="CAPTAIN",
            payload={
                "section_id": str(section.id),
                "data": {"time_mode": "FLEXIBLE", "system_type": "SIGHTSEEING"},
            },
            preview={"title": "Museum"},
            missing_fields=[{"name": "title", "label": "Title"}],
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=24),
        )

        response = self.client.patch(
            f"/api/trips/{self.trip.id}/ai/action-drafts/{draft.id}",
            {"payload": {"title": "Museum"}},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        draft.refresh_from_db()
        self.assertEqual(draft.status, AIActionDraftStatus.READY)
        self.assertEqual(draft.payload["data"]["title"], "Museum")
        self.assertNotIn("title", draft.payload)
