from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

ALLOWED_REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "😡", "👍", "👎"]


class ChatMessage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(
        "trips.Trip",
        on_delete=models.CASCADE,
        related_name="chat_messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="sent_chat_messages",
    )
    sender_display_name_snapshot = models.CharField(
        max_length=161,
        blank=True,
        default="",
    )
    sender_identify_tag_snapshot = models.CharField(
        max_length=31,
        null=True,
        blank=True,
        default=None,
    )
    content = models.TextField()
    client_message_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["trip", "-created_at", "-id"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["trip", "sender", "client_message_id"],
                condition=Q(client_message_id__isnull=False),
                name="chat_unique_client_message",
            ),
        ]

    def __str__(self) -> str:
        return f"ChatMessage {self.id} in trip={self.trip_id}"


class MessageReaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        ChatMessage,
        on_delete=models.CASCADE,
        related_name="reactions",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_reactions",
    )
    # max_length=8: emoji (up to 4 bytes) + variation selector (up to 3 bytes) + ZWJ sequences
    emoji = models.CharField(max_length=8)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["message", "user", "emoji"],
                name="chat_unique_message_user_emoji",
            )
        ]

    def __str__(self) -> str:
        return f"MessageReaction {self.emoji} by user={self.user_id} on message={self.message_id}"
