from __future__ import annotations

import logging

from django.conf import settings
from celery import shared_task

from memories.memory_video_services import (
    MemoryVideoRenderActiveError,
    render_trip_memory_video,
)

logger = logging.getLogger(__name__)


@shared_task(bind=True, soft_time_limit=600, time_limit=720)
def render_trip_memory_video_task(self, memory_id: str) -> None:
    try:
        render_trip_memory_video(memory_id)
    except MemoryVideoRenderActiveError as exc:
        self.retry(
            exc=exc,
            countdown=exc.retry_after_seconds,
            max_retries=int(getattr(settings, "TRIP_MEMORY_RENDER_ACTIVE_RETRY_MAX_RETRIES", 3)),
        )
