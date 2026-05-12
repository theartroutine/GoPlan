from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from ai.models import AIInteraction, AIInteractionStatus
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
