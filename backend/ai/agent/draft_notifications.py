from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from ai.action_types import TRANSFER_PAYER_ACTIONS, TRANSFER_RECIPIENT_ACTIONS
from ai.models import AIActionDraft, AIActionDraftStatus
from chat.models import ChatMessage
from chat.services import push_chat_message

TRANSFER_ACTIONS = TRANSFER_PAYER_ACTIONS | TRANSFER_RECIPIENT_ACTIONS
ACTIVE_DRAFT_STATUSES = {
    AIActionDraftStatus.NEEDS_INFO,
    AIActionDraftStatus.READY,
}


def refresh_transfer_action_draft_messages(*, trip_id, transfer_id) -> None:
    message_ids = list(
        AIActionDraft.objects.filter(
            trip_id=trip_id,
            action_type__in=TRANSFER_ACTIONS,
            status__in=ACTIVE_DRAFT_STATUSES,
            payload__transfer_id=str(transfer_id),
        )
        .values_list("response_message_id", flat=True)
        .distinct()
    )
    if not message_ids:
        return

    now = timezone.now()
    ChatMessage.objects.filter(pk__in=message_ids).update(updated_at=now)
    messages = list(
        ChatMessage.objects.select_related("sender").filter(pk__in=message_ids)
    )
    for message in messages:
        message.updated_at = now
        transaction.on_commit(lambda message=message: push_chat_message(message))
