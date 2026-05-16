from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from ai.models import AIActionDraft, AIActionDraftStatus, AIInteraction, AIInteractionStatus
from chat.models import ChatMessage
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole


class AIInteractionModelTests(TestCase):
    def test_busy_index_is_declared(self):
        index_names = {index.name for index in AIInteraction._meta.indexes}
        self.assertIn("ai_interac_trip_st_lock_idx", index_names)

    def test_create_pending_interaction(self):
        user = create_completed_user("ai-model@example.com", "aimodel", "AIM001")
        trip = Trip.objects.create(
            created_by=user,
            name="AI Model Trip",
            destination="Da Nang",
            start_date="2026-06-01",
            end_date="2026-06-05",
        )
        TripMember.objects.create(
            trip=trip,
            user=user,
            role=TripRole.CAPTAIN,
            status=MemberStatus.ACTIVE,
        )
        prompt_message = ChatMessage.objects.create(
            trip=trip,
            sender=user,
            sender_display_name_snapshot=user.display_name,
            sender_identify_tag_snapshot=user.identify_tag,
            content="@GoPlanAI hello",
            client_message_id=uuid4(),
        )

        interaction = AIInteraction.objects.create(
            trip=trip,
            requested_by=user,
            prompt_message=prompt_message,
            prompt="hello",
            status=AIInteractionStatus.PENDING,
            lock_expires_at=timezone.now() + timedelta(minutes=2),
        )

        self.assertEqual(interaction.provider, "deepseek")
        self.assertEqual(interaction.model, "deepseek-v4-flash")
        self.assertEqual(interaction.attempt_count, 0)
        self.assertIsNone(interaction.last_attempted_at)


class AIModelOverhaulFieldsTests(TestCase):
    def setUp(self):
        self.user = create_completed_user(
            "ai-overhaul@example.com", "overhauluser", "OVH001"
        )
        self.trip = Trip.objects.create(
            created_by=self.user,
            name="Overhaul Trip",
            destination="Hoi An",
            start_date="2026-07-01",
            end_date="2026-07-05",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=self.user,
            role=TripRole.CAPTAIN,
            status=MemberStatus.ACTIVE,
        )
        self.prompt_message = ChatMessage.objects.create(
            trip=self.trip,
            sender=self.user,
            sender_display_name_snapshot=self.user.display_name,
            sender_identify_tag_snapshot=self.user.identify_tag,
            content="@GoPlanAI plan something",
            client_message_id=uuid4(),
        )
        self.response_message = ChatMessage.objects.create(
            trip=self.trip,
            sender=self.user,
            sender_display_name_snapshot=self.user.display_name,
            sender_identify_tag_snapshot=self.user.identify_tag,
            content="Here is my suggestion.",
            client_message_id=uuid4(),
        )
        self.interaction = AIInteraction.objects.create(
            trip=self.trip,
            requested_by=self.user,
            prompt_message=self.prompt_message,
            prompt="plan something",
            status=AIInteractionStatus.PENDING,
            lock_expires_at=timezone.now() + timedelta(minutes=2),
        )

    def test_ai_action_draft_has_display_and_summary_defaults(self):
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response_message,
            action_type="timeline.activity.create",
            payload={"title": "X"},
            preview={"title": "X"},
            missing_fields=[],
            required_confirmation="none",
            status=AIActionDraftStatus.READY,
            expires_at=timezone.now() + timedelta(hours=1),
        )
        self.assertEqual(draft.display, {})
        self.assertEqual(draft.summary, "")

    def test_ai_interaction_observability_field_defaults(self):
        interaction = self.interaction
        self.assertIsNone(interaction.input_tokens)
        self.assertIsNone(interaction.output_tokens)
        self.assertIsNone(interaction.latency_ms)
        self.assertEqual(interaction.tool_calls_count, 0)

    def test_ai_action_draft_display_and_summary_persist_non_empty_values(self):
        draft = AIActionDraft.objects.create(
            trip=self.trip,
            interaction=self.interaction,
            response_message=self.response_message,
            action_type="timeline.activity.create",
            payload={"title": "X"},
            preview={"title": "X"},
            missing_fields=[],
            required_confirmation="none",
            status=AIActionDraftStatus.READY,
            expires_at=self.interaction.lock_expires_at,
            display={"icon": "activity", "title": "X"},
            summary="Draft summary line",
        )
        draft.refresh_from_db()
        self.assertEqual(draft.display, {"icon": "activity", "title": "X"})
        self.assertEqual(draft.summary, "Draft summary line")
