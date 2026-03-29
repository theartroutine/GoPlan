import uuid

from django.conf import settings
from django.db import models
from django.db.models.functions import Greatest, Least


class FriendRequestStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    ACCEPTED = "ACCEPTED", "Accepted"
    DECLINED = "DECLINED", "Declined"
    CANCELLED = "CANCELLED", "Cancelled"


class FriendRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_friend_requests",
    )
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_friend_requests",
    )
    status = models.CharField(
        max_length=10,
        choices=FriendRequestStatus.choices,
        default=FriendRequestStatus.PENDING,
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(sender=models.F("receiver")),
                name="fr_sender_ne_receiver",
            ),
            models.UniqueConstraint(
                Least("sender", "receiver"),
                Greatest("sender", "receiver"),
                condition=models.Q(status="PENDING"),
                name="fr_unique_pending_bilateral",
            ),
        ]
        indexes = [
            models.Index(fields=["receiver", "status"]),
            models.Index(fields=["sender", "status"]),
        ]

    def __str__(self):
        return f"{self.sender_id} → {self.receiver_id} ({self.status})"


class Friendship(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_low = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="friendships_low",
    )
    user_high = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="friendships_high",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user_low", "user_high"],
                name="fs_unique_pair",
            ),
            models.CheckConstraint(
                condition=models.Q(user_low__lt=models.F("user_high")),
                name="fs_low_lt_high",
            ),
        ]

    def __str__(self):
        return f"{self.user_low_id} ↔ {self.user_high_id}"
