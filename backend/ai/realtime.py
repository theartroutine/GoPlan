from __future__ import annotations

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def push_ai_typing_started(interaction) -> None:
    _push_ai_typing(
        interaction,
        "chat_ai_typing_started_push",
        {
            "type": "chat.ai_typing_started",
            "trip_id": str(interaction.trip_id),
            "interaction_id": str(interaction.id),
            "requested_by_user_id": (
                str(interaction.requested_by_id)
                if interaction.requested_by_id
                else None
            ),
        },
    )


def push_ai_typing_stopped(interaction) -> None:
    _push_ai_typing(
        interaction,
        "chat_ai_typing_stopped_push",
        {
            "type": "chat.ai_typing_stopped",
            "trip_id": str(interaction.trip_id),
            "interaction_id": str(interaction.id),
        },
    )


def _push_ai_typing(interaction, handler_type: str, data: dict) -> None:
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"trip_chat_{interaction.trip_id}",
            {"type": handler_type, "data": data},
        )
    except Exception:
        logger.error(
            "Failed to push AI typing event for interaction %s",
            interaction.id,
            exc_info=True,
        )
