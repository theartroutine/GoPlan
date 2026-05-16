from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from celery.exceptions import Retry
from django.test import TestCase
from django.test.utils import override_settings
from django.utils import timezone

from ai.agent.runner import AgentDraftSpec, AgentRunResult, AgentRunResultV2
from ai.deepseek import DeepSeekProviderError, DeepSeekUsage
from ai.lifecycle import InteractionAlreadyRunningError, claim_interaction_for_run
from ai.models import (
    AIActionDraft,
    AIActionDraftStatus,
    AIInteraction,
    AIInteractionErrorCode,
    AIInteractionStatus,
)
from ai.services import (
    GENERIC_AI_ERROR_MESSAGE,
    enqueue_ai_interaction,
    recover_stale_ai_interactions,
)
from ai.tasks import run_goplan_ai_interaction
from chat.models import ChatMessage
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole


def _make_trip(user):
    trip = Trip.objects.create(
        created_by=user,
        name="AI Task Trip",
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


def _make_interaction():
    user = create_completed_user("ai-task@example.com", "aitask", "AIT001")
    trip = _make_trip(user)
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
    return interaction


def _make_active_sibling_interaction(interaction):
    user = interaction.requested_by
    prompt_message = ChatMessage.objects.create(
        trip=interaction.trip,
        sender=user,
        sender_display_name_snapshot=user.display_name,
        sender_identify_tag_snapshot=user.identify_tag,
        content="@GoPlanAI newer",
        client_message_id=uuid4(),
    )
    return AIInteraction.objects.create(
        trip=interaction.trip,
        requested_by=user,
        prompt_message=prompt_message,
        prompt="newer",
        status=AIInteractionStatus.PENDING,
        lock_expires_at=timezone.now() + timedelta(minutes=2),
    )


class GoPlanAITaskTests(TestCase):
    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_task_success_creates_ai_message_and_saves_usage(
        self,
        mock_complete,
        mock_typing_started,
        mock_typing_stopped,
    ):
        interaction = _make_interaction()
        mock_complete.return_value = AgentRunResult(
            message="AI answer",
            drafts=[],
            usage=DeepSeekUsage(input_tokens=5, output_tokens=7, total_tokens=12),
        )

        run_goplan_ai_interaction(str(interaction.id))

        interaction.refresh_from_db()
        self.assertEqual(interaction.status, AIInteractionStatus.SUCCEEDED)
        self.assertEqual(interaction.attempt_count, 1)
        self.assertIsNotNone(interaction.last_attempted_at)
        self.assertEqual(interaction.total_tokens, 12)
        self.assertIsNotNone(interaction.response_message_id)
        self.assertEqual(interaction.response_message.content, "AI answer")
        self.assertEqual(interaction.response_message.sender_kind, "AI")
        mock_typing_started.assert_called_once()
        mock_typing_stopped.assert_called_once()

    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_task_provider_bad_response_triggers_retry(
        self,
        mock_complete,
        mock_typing_started,
        mock_typing_stopped,
    ):
        """PROVIDER_BAD_RESPONSE now has a retry policy (1 retry), so calling
        directly raises rather than immediately writing a failure message.
        The final failure message is only written once all retries are exhausted
        by the Celery worker."""
        interaction = _make_interaction()
        mock_complete.side_effect = DeepSeekProviderError(
            AIInteractionErrorCode.PROVIDER_BAD_RESPONSE
        )

        with self.assertRaises(DeepSeekProviderError):
            run_goplan_ai_interaction(str(interaction.id))

        mock_typing_started.assert_called_once()
        mock_typing_stopped.assert_called_once()

    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_redelivered_task_does_not_create_duplicate_ai_message(
        self,
        mock_complete,
        mock_typing_started,
        mock_typing_stopped,
    ):
        interaction = _make_interaction()
        mock_complete.return_value = AgentRunResult(
            message="AI answer",
            drafts=[],
            usage=DeepSeekUsage(input_tokens=5, output_tokens=7, total_tokens=12),
        )

        run_goplan_ai_interaction(str(interaction.id))
        run_goplan_ai_interaction(str(interaction.id))

        interaction.refresh_from_db()
        ai_messages = ChatMessage.objects.filter(sender_kind="AI")
        self.assertEqual(ai_messages.count(), 1)
        self.assertEqual(interaction.status, AIInteractionStatus.SUCCEEDED)
        mock_complete.assert_called_once()
        mock_typing_started.assert_called_once()
        mock_typing_stopped.assert_called_once()

    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_task_success_persists_action_draft(
        self,
        mock_agent,
        _typing_started,
        _typing_stopped,
    ):
        interaction = _make_interaction()
        mock_agent.return_value = AgentRunResult(
            message="I prepared an expense draft.",
            usage=DeepSeekUsage(input_tokens=1, output_tokens=2, total_tokens=3),
            drafts=[
                AgentDraftSpec(
                    action_type="expense.create",
                    required_confirmation="CAPTAIN",
                    status="READY",
                    payload={"title": "Dinner", "total_amount": "1200000"},
                    preview={"title": "Dinner"},
                    missing_fields=[],
                    preconditions={},
                )
            ],
        )

        run_goplan_ai_interaction(str(interaction.id))

        interaction.refresh_from_db()
        draft = AIActionDraft.objects.get()
        self.assertEqual(draft.response_message, interaction.response_message)
        self.assertEqual(draft.action_type, "expense.create")
        self.assertEqual(draft.status, AIActionDraftStatus.READY)

    @patch("ai.tasks.run_goplan_ai_interaction.delay")
    def test_enqueue_ai_interaction_saves_task_id(self, mock_delay):
        interaction = _make_interaction()
        mock_delay.return_value = SimpleNamespace(id="celery-task-1")

        enqueued = enqueue_ai_interaction(interaction)

        interaction.refresh_from_db()
        self.assertTrue(enqueued)
        self.assertEqual(interaction.celery_task_id, "celery-task-1")

    @patch("ai.tasks.run_goplan_ai_interaction.delay")
    def test_enqueue_ai_interaction_failure_keeps_pending_for_recovery(self, mock_delay):
        interaction = _make_interaction()
        mock_delay.side_effect = RuntimeError("broker unavailable")

        enqueued = enqueue_ai_interaction(interaction)

        interaction.refresh_from_db()
        self.assertFalse(enqueued)
        self.assertEqual(interaction.status, AIInteractionStatus.PENDING)
        self.assertEqual(interaction.celery_task_id, "")

    @patch("ai.tasks.run_goplan_ai_interaction.delay")
    def test_recovery_requeues_stale_running_interaction(self, mock_delay):
        interaction = _make_interaction()
        AIInteraction.objects.filter(pk=interaction.pk).update(
            status=AIInteractionStatus.RUNNING,
            attempt_count=1,
            lock_expires_at=timezone.now() - timedelta(seconds=1),
        )
        mock_delay.return_value = SimpleNamespace(id="recovered-task")

        result = recover_stale_ai_interactions()

        interaction.refresh_from_db()
        self.assertEqual(result["recovered"], 1)
        self.assertEqual(interaction.status, AIInteractionStatus.PENDING)
        self.assertEqual(interaction.celery_task_id, "recovered-task")
        self.assertGreater(interaction.lock_expires_at, timezone.now())

    @patch("ai.tasks.run_goplan_ai_interaction.delay")
    def test_recovery_skips_stale_interaction_when_trip_has_active_interaction(
        self,
        mock_delay,
    ):
        interaction = _make_interaction()
        AIInteraction.objects.filter(pk=interaction.pk).update(
            status=AIInteractionStatus.RUNNING,
            attempt_count=1,
            lock_expires_at=timezone.now() - timedelta(seconds=1),
        )
        _make_active_sibling_interaction(interaction)
        mock_delay.return_value = SimpleNamespace(id="should-not-recover")

        result = recover_stale_ai_interactions()

        interaction.refresh_from_db()
        self.assertEqual(result, {"recovered": 0, "failed": 0, "skipped": 1})
        self.assertEqual(interaction.status, AIInteractionStatus.RUNNING)
        self.assertLess(interaction.lock_expires_at, timezone.now())
        mock_delay.assert_not_called()

    def test_claim_retries_stale_interaction_when_trip_has_active_interaction(self):
        interaction = _make_interaction()
        AIInteraction.objects.filter(pk=interaction.pk).update(
            status=AIInteractionStatus.RUNNING,
            attempt_count=1,
            lock_expires_at=timezone.now() - timedelta(seconds=1),
        )
        _make_active_sibling_interaction(interaction)

        with self.assertRaises(InteractionAlreadyRunningError):
            claim_interaction_for_run(str(interaction.id))

        interaction.refresh_from_db()
        self.assertEqual(interaction.status, AIInteractionStatus.RUNNING)
        self.assertEqual(interaction.attempt_count, 1)
        self.assertLess(interaction.lock_expires_at, timezone.now())

    @patch("ai.tasks.run_goplan_ai_interaction.delay")
    def test_recovery_fails_abandoned_interaction_once(self, mock_delay):
        interaction = _make_interaction()
        AIInteraction.objects.filter(pk=interaction.pk).update(
            status=AIInteractionStatus.RUNNING,
            attempt_count=3,
            lock_expires_at=timezone.now() - timedelta(seconds=1),
        )

        result = recover_stale_ai_interactions()

        interaction.refresh_from_db()
        self.assertEqual(result["failed"], 1)
        self.assertEqual(interaction.status, AIInteractionStatus.FAILED)
        self.assertEqual(interaction.error_code, AIInteractionErrorCode.TASK_ERROR)
        self.assertEqual(interaction.response_message.content, GENERIC_AI_ERROR_MESSAGE)
        mock_delay.assert_not_called()


class TaskDispatchFlagTests(TestCase):
    def setUp(self):
        self.interaction = _make_interaction()

    @override_settings(GOPLAN_AI_TOOL_CALLING_ENABLED=True)
    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent_v2")
    def test_task_dispatches_to_runner_v2_when_flag_enabled(
        self, mock_v2, _typing_started, _typing_stopped
    ):
        mock_v2.return_value = AgentRunResultV2(drafts_created=0, message_text="hi")

        run_goplan_ai_interaction(str(self.interaction.id))

        mock_v2.assert_called_once()

    @override_settings(GOPLAN_AI_TOOL_CALLING_ENABLED=False)
    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_task_dispatches_to_runner_v1_when_flag_disabled(
        self, mock_v1, _typing_started, _typing_stopped
    ):
        mock_v1.return_value = AgentRunResult(
            message="hi",
            usage=DeepSeekUsage(0, 0, 0),
            drafts=[],
        )

        run_goplan_ai_interaction(str(self.interaction.id))

        mock_v1.assert_called_once()


class RetryPolicyTests(TestCase):
    """Tests for the differentiated retry policy per error_code.

    When calling the Celery task directly (not via .apply()), task.retry()
    raises the underlying exc (DeepSeekProviderError) rather than Retry,
    because request.called_directly is True. So "retry" tests assert on
    DeepSeekProviderError being raised and finish_interaction_failure NOT
    being called. "No retry" tests assert the interaction ends up FAILED.
    """

    def setUp(self):
        self.interaction = _make_interaction()

    # -------- v2 path: retryable error codes --------

    @override_settings(GOPLAN_AI_TOOL_CALLING_ENABLED=True)
    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.finish_interaction_failure")
    @patch("ai.tasks.run_goplan_ai_agent_v2")
    def test_rate_limit_triggers_retry_not_finish(
        self, mock_v2, mock_finish, _ts, _tp
    ):
        """RATE_LIMIT has retry policy → raises (retry) and does NOT call finish_interaction_failure."""
        mock_v2.return_value = AgentRunResultV2(
            error_code=AIInteractionErrorCode.RATE_LIMIT
        )
        with self.assertRaises(DeepSeekProviderError):
            run_goplan_ai_interaction(str(self.interaction.id))
        mock_finish.assert_not_called()

    @override_settings(GOPLAN_AI_TOOL_CALLING_ENABLED=True)
    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.finish_interaction_failure")
    @patch("ai.tasks.run_goplan_ai_agent_v2")
    def test_provider_unavailable_triggers_retry_not_finish(
        self, mock_v2, mock_finish, _ts, _tp
    ):
        """PROVIDER_UNAVAILABLE has retry policy → raises (retry) and does NOT call finish_interaction_failure."""
        mock_v2.return_value = AgentRunResultV2(
            error_code=AIInteractionErrorCode.PROVIDER_UNAVAILABLE
        )
        with self.assertRaises(DeepSeekProviderError):
            run_goplan_ai_interaction(str(self.interaction.id))
        mock_finish.assert_not_called()

    @override_settings(GOPLAN_AI_TOOL_CALLING_ENABLED=True)
    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.finish_interaction_failure")
    @patch("ai.tasks.run_goplan_ai_agent_v2")
    def test_timeout_triggers_retry_not_finish(
        self, mock_v2, mock_finish, _ts, _tp
    ):
        """TIMEOUT has retry policy → raises (retry) and does NOT call finish_interaction_failure."""
        mock_v2.return_value = AgentRunResultV2(
            error_code=AIInteractionErrorCode.TIMEOUT
        )
        with self.assertRaises(DeepSeekProviderError):
            run_goplan_ai_interaction(str(self.interaction.id))
        mock_finish.assert_not_called()

    @override_settings(GOPLAN_AI_TOOL_CALLING_ENABLED=True)
    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.finish_interaction_failure")
    @patch("ai.tasks.run_goplan_ai_agent_v2")
    def test_provider_bad_response_triggers_retry_not_finish(
        self, mock_v2, mock_finish, _ts, _tp
    ):
        """PROVIDER_BAD_RESPONSE has retry policy → raises (retry) and does NOT call finish_interaction_failure."""
        mock_v2.return_value = AgentRunResultV2(
            error_code=AIInteractionErrorCode.PROVIDER_BAD_RESPONSE
        )
        with self.assertRaises(DeepSeekProviderError):
            run_goplan_ai_interaction(str(self.interaction.id))
        mock_finish.assert_not_called()

    # -------- v2 path: non-retryable error codes --------

    @override_settings(GOPLAN_AI_TOOL_CALLING_ENABLED=True)
    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent_v2")
    def test_insufficient_balance_does_not_retry(self, mock_v2, _ts, _tp):
        """INSUFFICIENT_BALANCE has no retry policy → goes straight to finish_interaction_failure."""
        mock_v2.return_value = AgentRunResultV2(
            error_code=AIInteractionErrorCode.INSUFFICIENT_BALANCE
        )
        # Must not raise
        run_goplan_ai_interaction(str(self.interaction.id))
        self.interaction.refresh_from_db()
        self.assertEqual(
            self.interaction.error_code, AIInteractionErrorCode.INSUFFICIENT_BALANCE
        )
        self.assertEqual(self.interaction.status, AIInteractionStatus.FAILED)

    @override_settings(GOPLAN_AI_TOOL_CALLING_ENABLED=True)
    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent_v2")
    def test_config_missing_does_not_retry(self, mock_v2, _ts, _tp):
        """CONFIG_MISSING has no retry policy → goes straight to finish_interaction_failure."""
        mock_v2.return_value = AgentRunResultV2(
            error_code=AIInteractionErrorCode.CONFIG_MISSING
        )
        run_goplan_ai_interaction(str(self.interaction.id))
        self.interaction.refresh_from_db()
        self.assertEqual(
            self.interaction.error_code, AIInteractionErrorCode.CONFIG_MISSING
        )
        self.assertEqual(self.interaction.status, AIInteractionStatus.FAILED)

    @override_settings(GOPLAN_AI_TOOL_CALLING_ENABLED=True)
    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent_v2")
    def test_tool_unknown_does_not_retry(self, mock_v2, _ts, _tp):
        """TOOL_UNKNOWN has no retry policy → goes straight to finish_interaction_failure."""
        mock_v2.return_value = AgentRunResultV2(
            error_code=AIInteractionErrorCode.TOOL_UNKNOWN
        )
        run_goplan_ai_interaction(str(self.interaction.id))
        self.interaction.refresh_from_db()
        self.assertEqual(
            self.interaction.error_code, AIInteractionErrorCode.TOOL_UNKNOWN
        )
        self.assertEqual(self.interaction.status, AIInteractionStatus.FAILED)

    # -------- v1 path: DeepSeekProviderError retryable codes --------

    @override_settings(GOPLAN_AI_TOOL_CALLING_ENABLED=False)
    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.finish_interaction_failure")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_v1_rate_limit_triggers_retry(self, mock_v1, mock_finish, _ts, _tp):
        """v1 path: RATE_LIMIT via DeepSeekProviderError triggers retry."""
        mock_v1.side_effect = DeepSeekProviderError(AIInteractionErrorCode.RATE_LIMIT)
        with self.assertRaises(DeepSeekProviderError):
            run_goplan_ai_interaction(str(self.interaction.id))
        mock_finish.assert_not_called()

    @override_settings(GOPLAN_AI_TOOL_CALLING_ENABLED=False)
    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_v1_config_missing_does_not_retry(self, mock_v1, _ts, _tp):
        """v1 path: CONFIG_MISSING via DeepSeekProviderError goes straight to failure."""
        mock_v1.side_effect = DeepSeekProviderError(
            AIInteractionErrorCode.CONFIG_MISSING
        )
        run_goplan_ai_interaction(str(self.interaction.id))
        self.interaction.refresh_from_db()
        self.assertEqual(
            self.interaction.error_code, AIInteractionErrorCode.CONFIG_MISSING
        )
        self.assertEqual(self.interaction.status, AIInteractionStatus.FAILED)
