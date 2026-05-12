from __future__ import annotations

import logging

from billiard.exceptions import SoftTimeLimitExceeded
from celery import shared_task

from ai.deepseek import DeepSeekProviderError, complete_goplan_ai_prompt
from ai.lifecycle import (
    InteractionAlreadyRunningError,
    claim_interaction_for_run,
    finish_interaction_failure,
    finish_interaction_success,
)
from ai.models import AIInteractionErrorCode
from ai.realtime import push_ai_typing_started, push_ai_typing_stopped

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def run_goplan_ai_interaction(self, interaction_id: str) -> None:
    try:
        interaction = claim_interaction_for_run(interaction_id)
    except InteractionAlreadyRunningError as exc:
        raise self.retry(exc=exc, countdown=10, max_retries=12)

    if interaction is None:
        return

    typing_started = False
    try:
        push_ai_typing_started(interaction)
        typing_started = True
        result = complete_goplan_ai_prompt(interaction.prompt)
        finish_interaction_success(
            interaction=interaction,
            content=result.content,
            usage=result.usage,
        )
    except DeepSeekProviderError as exc:
        finish_interaction_failure(interaction=interaction, error_code=exc.error_code)
    except SoftTimeLimitExceeded:
        finish_interaction_failure(
            interaction=interaction,
            error_code=AIInteractionErrorCode.TIMEOUT,
        )
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
