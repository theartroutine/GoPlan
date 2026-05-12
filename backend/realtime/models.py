from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class WebSocketTicket(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="websocket_tickets",
    )
    auth_version = models.PositiveIntegerField()
    scope = models.CharField(max_length=64)
    expires_at = models.DateTimeField(db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "realtime_websocket_ticket"
        ordering = []
        indexes = [
            models.Index(
                fields=["user", "used_at", "expires_at"],
                name="rt_ws_ticket_user_used_exp",
            ),
        ]

    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()

    def is_used(self) -> bool:
        return self.used_at is not None
