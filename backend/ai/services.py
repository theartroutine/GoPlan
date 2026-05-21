from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ai.models import AIInteraction, AIInteractionStatus
from trips.models import Trip

logger = logging.getLogger(__name__)

AI_LOCK_TTL = timedelta(seconds=settings.GOPLAN_AI_LOCK_TTL_SECONDS)
GENERIC_AI_ERROR_MESSAGE = "GoPlanAI hiện chưa trả lời được. Thử lại sau."
ACTIVE_AI_STATUSES = (AIInteractionStatus.PENDING, AIInteractionStatus.RUNNING)

_ERROR_MESSAGES = {
    "PROVIDER_UNAVAILABLE": "Dịch vụ AI tạm thời gián đoạn. Bạn thử lại sau ít phút giúp mình nhé.",
    "RATE_LIMIT": "Mình đang xử lý quá nhiều yêu cầu. Bạn thử lại sau 30 giây nhé.",
    "TIMEOUT": "Mình mất quá nhiều thời gian trả lời. Bạn nhắc lại giúp mình nhé.",
    "PROVIDER_BAD_RESPONSE": "Mình chưa đưa ra được câu trả lời phù hợp. Bạn diễn đạt lại giúp mình nhé.",
    "INSUFFICIENT_BALANCE": "Dịch vụ AI tạm thời chưa khả dụng. Đội ngũ đã được thông báo.",
    "TOOL_VALIDATION_FAILED": "Mình hiểu sai định dạng yêu cầu của bạn. Bạn nói cụ thể hơn được không?",
    "TOOL_UNKNOWN": "Mình chưa hỗ trợ thao tác đó. Bạn thử cách khác giúp mình nhé.",
    "CONFIG_MISSING": "Tính năng AI chưa được cấu hình. Báo admin giúp mình nhé.",
    "INTERNAL_ERROR": "Có lỗi không mong muốn. Đội ngũ đã được thông báo.",
    "TASK_ERROR": "Có lỗi không mong muốn. Đội ngũ đã được thông báo.",
}


def message_for_error_code(error_code: str | None) -> str:
    if not error_code:
        return GENERIC_AI_ERROR_MESSAGE
    return _ERROR_MESSAGES.get(error_code, GENERIC_AI_ERROR_MESSAGE)


class AIServiceError(Exception):
    error_code = "AI_ERROR"


class AIInvalidPromptError(AIServiceError):
    error_code = "INVALID_AI_PROMPT"


class AIBusyError(AIServiceError):
    error_code = "AI_BUSY"


def ensure_ai_prompt_available(trip) -> None:
    now = timezone.now()
    if has_active_ai_interaction(trip_id=trip.id, now=now):
        raise AIBusyError("GoPlanAI is already replying.")


def has_active_ai_interaction(
    *,
    trip_id,
    now=None,
    exclude_interaction_id=None,
) -> bool:
    resolved_now = now or timezone.now()
    queryset = AIInteraction.objects.filter(
        trip_id=trip_id,
        status__in=ACTIVE_AI_STATUSES,
        lock_expires_at__gt=resolved_now,
    )
    if exclude_interaction_id is not None:
        queryset = queryset.exclude(pk=exclude_interaction_id)
    return queryset.exists()


def create_pending_interaction(*, trip, requested_by, prompt_message, prompt: str):
    if not prompt.strip():
        raise AIInvalidPromptError("AI prompt is required.")

    interaction = AIInteraction.objects.create(
        trip=trip,
        requested_by=requested_by,
        prompt_message=prompt_message,
        prompt=prompt,
        status=AIInteractionStatus.PENDING,
        model=settings.DEEPSEEK_MODEL,
        lock_expires_at=timezone.now() + AI_LOCK_TTL,
    )
    return interaction


def enqueue_ai_interaction(interaction) -> bool:
    from ai.tasks import run_goplan_ai_interaction

    try:
        result = run_goplan_ai_interaction.delay(str(interaction.id))
    except Exception:
        logger.exception(
            "Failed to enqueue GoPlanAI interaction %s",
            interaction.id,
        )
        return False

    AIInteraction.objects.filter(pk=interaction.pk).update(
        celery_task_id=result.id,
    )
    return True


def enqueue_ai_interaction_after_commit(interaction) -> None:
    transaction.on_commit(lambda: enqueue_ai_interaction(interaction))


def recover_stale_ai_interactions(*, limit: int = 50) -> dict[str, int]:
    from ai.lifecycle import finish_interaction_failure
    from ai.models import AIInteractionErrorCode

    now = timezone.now()
    candidate_ids = list(
        AIInteraction.objects.filter(
            status__in=[AIInteractionStatus.PENDING, AIInteractionStatus.RUNNING],
            lock_expires_at__lte=now,
        )
        .order_by("lock_expires_at", "created_at")
        .values_list("id", flat=True)[:limit]
    )

    recovered = 0
    failed = 0
    skipped = 0

    for interaction_id in candidate_ids:
        should_enqueue = False
        should_fail = False
        interaction = None

        with transaction.atomic():
            trip_id = (
                AIInteraction.objects.filter(pk=interaction_id)
                .values_list("trip_id", flat=True)
                .first()
            )
            if trip_id is None:
                skipped += 1
                continue

            try:
                Trip.objects.select_for_update().get(pk=trip_id)
            except Trip.DoesNotExist:
                skipped += 1
                continue

            interaction = (
                AIInteraction.objects.select_for_update(skip_locked=True)
                .filter(pk=interaction_id)
                .first()
            )
            if interaction is None:
                skipped += 1
                continue
            if interaction.response_message_id is not None:
                skipped += 1
                continue
            if interaction.status not in (
                AIInteractionStatus.PENDING,
                AIInteractionStatus.RUNNING,
            ):
                skipped += 1
                continue
            if interaction.lock_expires_at > now:
                skipped += 1
                continue
            if has_active_ai_interaction(
                trip_id=interaction.trip_id,
                now=now,
                exclude_interaction_id=interaction.id,
            ):
                skipped += 1
                continue

            if interaction.attempt_count >= settings.GOPLAN_AI_MAX_ATTEMPTS:
                should_fail = True
            else:
                interaction.status = AIInteractionStatus.PENDING
                interaction.lock_expires_at = now + AI_LOCK_TTL
                interaction.save(
                    update_fields=["status", "lock_expires_at", "updated_at"]
                )
                should_enqueue = True

        if should_fail and interaction is not None:
            finish_interaction_failure(
                interaction=interaction,
                error_code=interaction.error_code or AIInteractionErrorCode.TASK_ERROR,
            )
            failed += 1
            continue

        if should_enqueue and interaction is not None:
            if enqueue_ai_interaction(interaction):
                recovered += 1
            else:
                skipped += 1

    return {"recovered": recovered, "failed": failed, "skipped": skipped}
