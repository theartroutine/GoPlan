from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from ai.models import AIInteraction, AIInteractionStatus
from ai.services import AI_LOCK_TTL, GENERIC_AI_ERROR_MESSAGE
from chat.models import ChatMessage, ChatMessageAIStatus, ChatMessageSenderKind
from chat.services import push_chat_message


class InteractionAlreadyRunningError(Exception):
    """Raised when another worker still owns this interaction's active lock."""


def claim_interaction_for_run(interaction_id):
    now = timezone.now()
    with transaction.atomic():
        interaction = (
            AIInteraction.objects.select_for_update()
            .get(pk=interaction_id)
        )
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


def finish_interaction_success(*, interaction, content: str, usage) -> ChatMessage:
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
        interaction.response_message = message
        interaction.status = AIInteractionStatus.SUCCEEDED
        interaction.error_code = None
        interaction.input_tokens = usage.input_tokens
        interaction.output_tokens = usage.output_tokens
        interaction.total_tokens = usage.total_tokens
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
