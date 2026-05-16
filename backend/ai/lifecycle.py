from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ai.agent.display import build_display
from ai.models import AIActionDraft, AIActionDraftStatus, AIInteraction, AIInteractionStatus
from ai.services import (
    AI_LOCK_TTL,
    GENERIC_AI_ERROR_MESSAGE,
    has_active_ai_interaction,
)
from chat.models import ChatMessage, ChatMessageAIStatus, ChatMessageSenderKind
from chat.services import push_chat_message
from trips.models import Trip


def summarize_draft(*, action_type: str, payload: dict, status: str) -> str:
    title = payload.get("title") or action_type
    return f"[{status}] {action_type}: {title[:160]}"


class InteractionAlreadyRunningError(Exception):
    """Raised when another worker still owns this interaction's active lock."""


def claim_interaction_for_run(interaction_id):
    now = timezone.now()
    trip_id = (
        AIInteraction.objects.filter(pk=interaction_id)
        .values_list("trip_id", flat=True)
        .first()
    )
    if trip_id is None:
        return None

    with transaction.atomic():
        try:
            Trip.objects.select_for_update().get(pk=trip_id)
        except Trip.DoesNotExist:
            return None

        try:
            interaction = AIInteraction.objects.select_for_update().get(
                pk=interaction_id
            )
        except AIInteraction.DoesNotExist:
            return None

        if interaction.response_message_id is not None:
            return None
        if interaction.status in (
            AIInteractionStatus.SUCCEEDED,
            AIInteractionStatus.FAILED,
        ):
            return None
        if (
            interaction.status == AIInteractionStatus.RUNNING
            and interaction.lock_expires_at > now
        ):
            raise InteractionAlreadyRunningError(str(interaction.id))
        if has_active_ai_interaction(
            trip_id=interaction.trip_id,
            now=now,
            exclude_interaction_id=interaction.id,
        ):
            raise InteractionAlreadyRunningError(str(interaction.id))

        interaction.status = AIInteractionStatus.RUNNING
        interaction.started_at = interaction.started_at or now
        interaction.last_attempted_at = now
        interaction.attempt_count += 1
        interaction.lock_expires_at = now + AI_LOCK_TTL
        interaction.save(
            update_fields=[
                "status",
                "started_at",
                "last_attempted_at",
                "attempt_count",
                "lock_expires_at",
                "updated_at",
            ]
        )
    return interaction


def finish_interaction_success(
    *,
    interaction,
    content: str,
    usage,
    drafts=None,
) -> ChatMessage:
    now = timezone.now()
    with transaction.atomic():
        interaction = AIInteraction.objects.select_for_update().get(pk=interaction.pk)
        if interaction.response_message_id is not None:
            return interaction.response_message
        message = ChatMessage.objects.create(
            trip=interaction.trip,
            sender=None,
            sender_kind=ChatMessageSenderKind.AI,
            sender_display_name_snapshot="GoPlanAI",
            sender_identify_tag_snapshot=None,
            content=content,
            ai_status=ChatMessageAIStatus.SUCCESS,
        )
        draft_specs = drafts or []
        expires_at = now + timedelta(
            seconds=settings.GOPLAN_AI_ACTION_DRAFT_TTL_SECONDS
        )
        trip_context = {
            "timezone": interaction.trip.timezone,
            "currency_code": interaction.trip.currency_code,
        }
        AIActionDraft.objects.bulk_create(
            [
                AIActionDraft(
                    trip=interaction.trip,
                    interaction=interaction,
                    response_message=message,
                    requested_by=interaction.requested_by,
                    action_type=draft.action_type,
                    status=(
                        draft.status
                        if draft.status
                        else AIActionDraftStatus.NEEDS_INFO
                    ),
                    payload=draft.payload,
                    preview=draft.preview,
                    display=build_display(
                        action_type=draft.action_type,
                        payload=draft.payload,
                        trip_context=trip_context,
                    ),
                    summary=summarize_draft(
                        action_type=draft.action_type,
                        payload=draft.payload,
                        status=draft.status or AIActionDraftStatus.NEEDS_INFO,
                    ),
                    missing_fields=draft.missing_fields,
                    preconditions=draft.preconditions,
                    required_confirmation=draft.required_confirmation,
                    expires_at=expires_at,
                )
                for draft in draft_specs
            ]
        )
        interaction.response_message = message
        interaction.status = AIInteractionStatus.SUCCEEDED
        interaction.error_code = None
        interaction.input_tokens = getattr(usage, "input_tokens", None)
        interaction.output_tokens = getattr(usage, "output_tokens", None)
        interaction.total_tokens = getattr(usage, "total_tokens", None)
        interaction.completed_at = now
        interaction.lock_expires_at = now
        interaction.save()
        transaction.on_commit(lambda: push_chat_message(message))
    return message


def finish_interaction_failure(*, interaction, error_code: str) -> ChatMessage:
    now = timezone.now()
    with transaction.atomic():
        interaction = AIInteraction.objects.select_for_update().get(pk=interaction.pk)
        if interaction.response_message_id is not None:
            return interaction.response_message
        message = ChatMessage.objects.create(
            trip=interaction.trip,
            sender=None,
            sender_kind=ChatMessageSenderKind.AI,
            sender_display_name_snapshot="GoPlanAI",
            sender_identify_tag_snapshot=None,
            content=GENERIC_AI_ERROR_MESSAGE,
            ai_status=ChatMessageAIStatus.ERROR,
        )
        interaction.response_message = message
        interaction.status = AIInteractionStatus.FAILED
        interaction.error_code = error_code
        interaction.completed_at = now
        interaction.lock_expires_at = now
        interaction.save()
        transaction.on_commit(lambda: push_chat_message(message))
    return message
