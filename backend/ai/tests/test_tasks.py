from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from ai.agent.drafts import create_action_draft
from ai.agent.runner import AgentRunResult
from ai.deepseek import DeepSeekProviderError
from ai.lifecycle import InteractionAlreadyRunningError, claim_interaction_for_run
from ai.models import (
    AIActionDraft,
    AIActionDraftStatus,
    AIInteraction,
    AIInteractionErrorCode,
    AIInteractionStatus,
)
from ai.services import (
    enqueue_ai_interaction,
    message_for_error_code,
    recover_stale_ai_interactions,
)
from ai.tasks import _handle_failure, run_goplan_ai_interaction
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
            drafts_created=0,
            message_text="AI answer",
        )

        run_goplan_ai_interaction(str(interaction.id))

        interaction.refresh_from_db()
        self.assertEqual(interaction.status, AIInteractionStatus.SUCCEEDED)
        self.assertEqual(interaction.attempt_count, 1)
        self.assertIsNotNone(interaction.last_attempted_at)
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
        mock_complete.return_value = AgentRunResult(
            error_code=AIInteractionErrorCode.PROVIDER_BAD_RESPONSE
        )

        with self.assertRaises(DeepSeekProviderError):
            run_goplan_ai_interaction(str(interaction.id))

        interaction.refresh_from_db()
        self.assertEqual(interaction.status, AIInteractionStatus.PENDING)
        self.assertLessEqual(interaction.lock_expires_at, timezone.now())
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
            drafts_created=0,
            message_text="AI answer",
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

        def run_agent(*, interaction):
            create_action_draft(
                trip=interaction.trip,
                interaction=interaction,
                action_type="expense.create",
                required_confirmation="CAPTAIN",
                status=AIActionDraftStatus.READY,
                payload={"title": "Dinner", "total_amount": "1200000"},
            )
            return AgentRunResult(
                drafts_created=1,
                message_text="I prepared an expense draft.",
            )

        mock_agent.side_effect = run_agent

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
        self.assertEqual(
            interaction.response_message.content,
            message_for_error_code(AIInteractionErrorCode.TASK_ERROR),
        )
        mock_delay.assert_not_called()


class TaskDispatchTests(TestCase):
    def setUp(self):
        self.interaction = _make_interaction()

    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_task_dispatches_to_runner(
        self,
        mock_agent,
        _typing_started,
        _typing_stopped,
    ):
        mock_agent.return_value = AgentRunResult(drafts_created=0, message_text="hi")

        run_goplan_ai_interaction(str(self.interaction.id))

        mock_agent.assert_called_once()


class RetryPolicyTests(TestCase):
    """Tests for the differentiated retry policy per error_code.

    When calling the Celery task directly (not via .apply()), task.retry()
    raises the underlying exc (DeepSeekProviderError) rather than Retry.
    Retry tests assert on DeepSeekProviderError being raised and
    finish_interaction_failure NOT being called. No-retry tests assert the
    interaction ends up FAILED.
    """

    def setUp(self):
        self.interaction = _make_interaction()

    # -------- Retryable error codes --------

    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.finish_interaction_failure")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_rate_limit_triggers_retry_not_finish(
        self, mock_agent, mock_finish, _ts, _tp
    ):
        mock_agent.return_value = AgentRunResult(
            error_code=AIInteractionErrorCode.RATE_LIMIT
        )
        with self.assertRaises(DeepSeekProviderError):
            run_goplan_ai_interaction(str(self.interaction.id))
        self.interaction.refresh_from_db()
        self.assertEqual(self.interaction.status, AIInteractionStatus.PENDING)
        self.assertGreater(self.interaction.lock_expires_at, timezone.now())
        self.assertEqual(
            self.interaction.error_code,
            AIInteractionErrorCode.RATE_LIMIT,
        )
        mock_finish.assert_not_called()

    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.finish_interaction_failure")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_provider_unavailable_triggers_retry_not_finish(
        self, mock_agent, mock_finish, _ts, _tp
    ):
        mock_agent.return_value = AgentRunResult(
            error_code=AIInteractionErrorCode.PROVIDER_UNAVAILABLE
        )
        with self.assertRaises(DeepSeekProviderError):
            run_goplan_ai_interaction(str(self.interaction.id))
        mock_finish.assert_not_called()

    def test_retryable_failure_keeps_lock_until_scheduled_retry(self):
        task = SimpleNamespace(
            request=SimpleNamespace(retries=0),
            retry=Mock(side_effect=DeepSeekProviderError(AIInteractionErrorCode.PROVIDER_UNAVAILABLE)),
        )

        with self.assertRaises(DeepSeekProviderError):
            _handle_failure(
                task,
                interaction=self.interaction,
                error_code=AIInteractionErrorCode.PROVIDER_UNAVAILABLE,
            )

        self.interaction.refresh_from_db()
        self.assertEqual(self.interaction.status, AIInteractionStatus.PENDING)
        self.assertGreater(self.interaction.lock_expires_at, timezone.now())
        task.retry.assert_called_once()

    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.finish_interaction_failure")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_timeout_triggers_retry_not_finish(
        self, mock_agent, mock_finish, _ts, _tp
    ):
        mock_agent.return_value = AgentRunResult(
            error_code=AIInteractionErrorCode.TIMEOUT
        )
        with self.assertRaises(DeepSeekProviderError):
            run_goplan_ai_interaction(str(self.interaction.id))
        mock_finish.assert_not_called()

    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.finish_interaction_failure")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_provider_bad_response_triggers_retry_not_finish(
        self, mock_agent, mock_finish, _ts, _tp
    ):
        mock_agent.return_value = AgentRunResult(
            error_code=AIInteractionErrorCode.PROVIDER_BAD_RESPONSE
        )
        with self.assertRaises(DeepSeekProviderError):
            run_goplan_ai_interaction(str(self.interaction.id))
        mock_finish.assert_not_called()

    def test_exhausted_retryable_error_finishes_with_original_error_code(self):
        task = SimpleNamespace(
            request=SimpleNamespace(retries=1),
            retry=Mock(side_effect=AssertionError("retry should not be called")),
        )

        _handle_failure(
            task,
            interaction=self.interaction,
            error_code=AIInteractionErrorCode.PROVIDER_BAD_RESPONSE,
        )

        self.interaction.refresh_from_db()
        self.assertEqual(self.interaction.status, AIInteractionStatus.FAILED)
        self.assertEqual(
            self.interaction.error_code,
            AIInteractionErrorCode.PROVIDER_BAD_RESPONSE,
        )
        self.assertIsNotNone(self.interaction.response_message_id)
        self.assertEqual(
            self.interaction.response_message.content,
            message_for_error_code(AIInteractionErrorCode.PROVIDER_BAD_RESPONSE),
        )
        task.retry.assert_not_called()

    # -------- Non-retryable error codes --------

    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_insufficient_balance_does_not_retry(self, mock_agent, _ts, _tp):
        mock_agent.return_value = AgentRunResult(
            error_code=AIInteractionErrorCode.INSUFFICIENT_BALANCE
        )
        run_goplan_ai_interaction(str(self.interaction.id))
        self.interaction.refresh_from_db()
        self.assertEqual(
            self.interaction.error_code, AIInteractionErrorCode.INSUFFICIENT_BALANCE
        )
        self.assertEqual(self.interaction.status, AIInteractionStatus.FAILED)

    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_config_missing_does_not_retry(self, mock_agent, _ts, _tp):
        mock_agent.return_value = AgentRunResult(
            error_code=AIInteractionErrorCode.CONFIG_MISSING
        )
        run_goplan_ai_interaction(str(self.interaction.id))
        self.interaction.refresh_from_db()
        self.assertEqual(
            self.interaction.error_code, AIInteractionErrorCode.CONFIG_MISSING
        )
        self.assertEqual(self.interaction.status, AIInteractionStatus.FAILED)

    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_tool_unknown_does_not_retry(self, mock_agent, _ts, _tp):
        mock_agent.return_value = AgentRunResult(
            error_code=AIInteractionErrorCode.TOOL_UNKNOWN
        )
        run_goplan_ai_interaction(str(self.interaction.id))
        self.interaction.refresh_from_db()
        self.assertEqual(
            self.interaction.error_code, AIInteractionErrorCode.TOOL_UNKNOWN
        )
        self.assertEqual(self.interaction.status, AIInteractionStatus.FAILED)

    @patch("ai.tasks.push_ai_typing_stopped")
    @patch("ai.tasks.push_ai_typing_started")
    @patch("ai.tasks.run_goplan_ai_agent")
    def test_tool_validation_failed_does_not_retry(self, mock_agent, _ts, _tp):
        mock_agent.return_value = AgentRunResult(
            error_code=AIInteractionErrorCode.TOOL_VALIDATION_FAILED
        )

        run_goplan_ai_interaction(str(self.interaction.id))

        self.interaction.refresh_from_db()
        self.assertEqual(
            self.interaction.error_code,
            AIInteractionErrorCode.TOOL_VALIDATION_FAILED,
        )
        self.assertEqual(self.interaction.status, AIInteractionStatus.FAILED)
        self.assertIsNotNone(self.interaction.response_message_id)
