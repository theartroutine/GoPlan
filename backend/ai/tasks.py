from __future__ import annotations

import logging

from billiard.exceptions import SoftTimeLimitExceeded
from celery import shared_task
from celery.exceptions import Retry

from ai.agent.runner import run_goplan_ai_agent
from ai.deepseek import DeepSeekProviderError
from ai.lifecycle import (
    InteractionAlreadyRunningError,
    claim_interaction_for_run,
    finish_interaction_failure,
    finish_interaction_success,
)
from ai.models import AIInteraction, AIInteractionErrorCode
from ai.realtime import push_ai_typing_started, push_ai_typing_stopped

logger = logging.getLogger(__name__)

# -------- Retry Policy --------

_RETRY_POLICY: dict[str, tuple[int, str]] = {
    AIInteractionErrorCode.PROVIDER_UNAVAILABLE: (3, "exp:5,20,60"),
    AIInteractionErrorCode.TIMEOUT: (3, "exp:5,20,60"),
    AIInteractionErrorCode.RATE_LIMIT: (2, "fixed:30"),
    AIInteractionErrorCode.PROVIDER_BAD_RESPONSE: (1, "fixed:0"),
    AIInteractionErrorCode.INTERNAL_ERROR: (1, "fixed:10"),
}


def _retry_countdown(schedule: str, attempt: int) -> int:
    if schedule.startswith("fixed:"):
        return int(schedule.split(":", 1)[1])
    backoffs = [int(x) for x in schedule.split(":", 1)[1].split(",")]
    return backoffs[min(attempt, len(backoffs) - 1)]


def _handle_failure(task, *, interaction: AIInteraction, error_code: str) -> None:
    """Retry if a retry policy applies, otherwise mark interaction as failed.

    When a retry policy applies, this calls task.retry() which always raises
    (either Retry in eager/worker mode, or the underlying exc in direct-call
    mode). Callers must not swallow the exception that propagates out.
    """
    if error_code in _RETRY_POLICY:
        max_retries, schedule = _RETRY_POLICY[error_code]
        countdown = _retry_countdown(schedule, task.request.retries)
        # task.retry() always raises; it never returns.
        task.retry(
            exc=DeepSeekProviderError(error_code),
            countdown=countdown,
            max_retries=max_retries,
        )
        # Unreachable, but guards against future throw=False changes.
        return  # pragma: no cover
    finish_interaction_failure(interaction=interaction, error_code=error_code)


# -------- Task --------


@shared_task(bind=True)
def run_goplan_ai_interaction(self, interaction_id: str) -> None:
    try:
        interaction = claim_interaction_for_run(interaction_id)
    except InteractionAlreadyRunningError as exc:
        raise self.retry(exc=exc, countdown=10, max_retries=12)

    if interaction is None:
        return

    # Resolve the error code outside the broad exception handler so that
    # _handle_failure -> task.retry() cannot be re-caught below.
    resolved_error_code: str | None = None
    typing_started = False

    try:
        push_ai_typing_started(interaction)
        typing_started = True

        result = run_goplan_ai_agent(interaction=interaction)
        if result.error_code:
            resolved_error_code = result.error_code
        else:
            finish_interaction_success(
                interaction=interaction,
                message_text=result.message_text or "",
            )

    except SoftTimeLimitExceeded:
        resolved_error_code = AIInteractionErrorCode.TIMEOUT
    except Exception:
        logger.exception(
            "GoPlanAI task failed for interaction %s",
            interaction_id,
        )
        finish_interaction_failure(
            interaction=interaction,
            error_code=AIInteractionErrorCode.TASK_ERROR,
        )
    finally:
        if typing_started:
            push_ai_typing_stopped(interaction)

    # Handle failure outside try/except so that task.retry() (which raises)
    # cannot be caught by the exception handlers above.
    if resolved_error_code is not None:
        _handle_failure(self, interaction=interaction, error_code=resolved_error_code)
