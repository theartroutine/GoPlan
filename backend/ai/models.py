from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class AIInteractionStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    RUNNING = "RUNNING", "Running"
    SUCCEEDED = "SUCCEEDED", "Succeeded"
    FAILED = "FAILED", "Failed"


class AIInteractionErrorCode(models.TextChoices):
    TIMEOUT = "TIMEOUT", "Timeout"
    RATE_LIMIT = "RATE_LIMIT", "Rate limit"
    INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE", "Insufficient balance"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE", "Provider unavailable"
    PROVIDER_BAD_RESPONSE = "PROVIDER_BAD_RESPONSE", "Provider bad response"
    CONFIG_MISSING = "CONFIG_MISSING", "Config missing"
    TASK_ERROR = "TASK_ERROR", "Task error"


class AIInteraction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(
        "trips.Trip",
        on_delete=models.CASCADE,
        related_name="ai_interactions",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="requested_ai_interactions",
    )
    prompt_message = models.OneToOneField(
        "chat.ChatMessage",
        on_delete=models.CASCADE,
        related_name="ai_prompt_interaction",
    )
    response_message = models.OneToOneField(
        "chat.ChatMessage",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ai_response_interaction",
    )
    status = models.CharField(
        max_length=10,
        choices=AIInteractionStatus.choices,
        default=AIInteractionStatus.PENDING,
    )
    provider = models.CharField(max_length=32, default="deepseek")
    model = models.CharField(max_length=64, default="deepseek-v4-flash")
    prompt = models.TextField()
    error_code = models.CharField(
        max_length=32,
        choices=AIInteractionErrorCode.choices,
        null=True,
        blank=True,
    )
    input_tokens = models.PositiveIntegerField(null=True, blank=True)
    output_tokens = models.PositiveIntegerField(null=True, blank=True)
    total_tokens = models.PositiveIntegerField(null=True, blank=True)
    celery_task_id = models.CharField(max_length=255, blank=True, default="")
    attempt_count = models.PositiveSmallIntegerField(default=0)
    lock_expires_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    last_attempted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(
                fields=["trip", "status", "lock_expires_at"],
                name="ai_interac_trip_st_lock_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"AIInteraction {self.id} trip={self.trip_id} status={self.status}"
