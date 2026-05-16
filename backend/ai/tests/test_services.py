from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from ai.models import AIInteraction, AIInteractionErrorCode, AIInteractionStatus
from ai.services import (
    AIBusyError,
    GENERIC_AI_ERROR_MESSAGE,
    ensure_ai_prompt_available,
    message_for_error_code,
)
from chat.models import ChatMessage
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole


def _make_trip(user):
    trip = Trip.objects.create(
        created_by=user,
        name="AI Service Trip",
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
    return trip


def _make_prompt_message(*, trip, user):
    return ChatMessage.objects.create(
        trip=trip,
        sender=user,
        sender_display_name_snapshot=user.display_name,
        sender_identify_tag_snapshot=user.identify_tag,
        content="@GoPlanAI hello",
        client_message_id=uuid4(),
    )


class AIReservationServiceTests(TestCase):
    def test_active_interaction_blocks_new_ai_prompt(self):
        user = create_completed_user("ai-busy@example.com", "aibusy", "AIB001")
        trip = _make_trip(user)
        AIInteraction.objects.create(
            trip=trip,
            requested_by=user,
            prompt_message=_make_prompt_message(trip=trip, user=user),
            prompt="hello",
            status=AIInteractionStatus.PENDING,
            lock_expires_at=timezone.now() + timedelta(minutes=2),
        )

        with self.assertRaises(AIBusyError):
            ensure_ai_prompt_available(trip)

    def test_stale_interaction_does_not_block_new_ai_prompt(self):
        user = create_completed_user("ai-stale@example.com", "aistale", "AIS001")
        trip = _make_trip(user)
        AIInteraction.objects.create(
            trip=trip,
            requested_by=user,
            prompt_message=_make_prompt_message(trip=trip, user=user),
            prompt="hello",
            status=AIInteractionStatus.RUNNING,
            lock_expires_at=timezone.now() - timedelta(seconds=1),
        )

        ensure_ai_prompt_available(trip)


class MessageForErrorCodeTests(TestCase):
    def test_message_for_error_code_returns_specific_strings(self):
        self.assertIn("gián đoạn", message_for_error_code(AIInteractionErrorCode.PROVIDER_UNAVAILABLE))
        self.assertIn("30 giây", message_for_error_code(AIInteractionErrorCode.RATE_LIMIT))
        self.assertIn("định dạng", message_for_error_code(AIInteractionErrorCode.TOOL_VALIDATION_FAILED))
        self.assertIn("hỗ trợ thao tác", message_for_error_code(AIInteractionErrorCode.TOOL_UNKNOWN))
        self.assertIn("chưa khả dụng", message_for_error_code(AIInteractionErrorCode.INSUFFICIENT_BALANCE))

    def test_message_for_error_code_unknown_falls_back_to_generic(self):
        self.assertEqual(message_for_error_code("not_a_real_code"), GENERIC_AI_ERROR_MESSAGE)
        self.assertEqual(message_for_error_code(None), GENERIC_AI_ERROR_MESSAGE)
