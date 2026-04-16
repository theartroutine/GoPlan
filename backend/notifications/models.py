import uuid

from django.conf import settings
from django.db import models


class NotificationType(models.TextChoices):
    # Friend notifications
    FRIEND_REQUEST = "FRIEND_REQUEST", "Friend Request"
    FRIEND_ACCEPTED = "FRIEND_ACCEPTED", "Friend Accepted"
    # Trip notifications
    TRIP_INVITATION = "TRIP_INVITATION", "Trip Invitation"
    TRIP_INVITATION_ACCEPTED = "TRIP_INVITATION_ACCEPTED", "Trip Invitation Accepted"
    TRIP_INVITATION_DECLINED = "TRIP_INVITATION_DECLINED", "Trip Invitation Declined"
    TRIP_CANCELLED = "TRIP_CANCELLED", "Trip Cancelled"
    TRIP_MEMBER_REMOVED = "TRIP_MEMBER_REMOVED", "Trip Member Removed"


class Notification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="sent_notifications",
    )
    type = models.CharField(max_length=50, choices=NotificationType.choices)
    payload = models.JSONField(default=dict, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "-created_at"]),
            models.Index(
                fields=["recipient"],
                condition=models.Q(read_at__isnull=True),
                name="idx_unread_notifications",
            ),
        ]

    def __str__(self):
        return f"{self.type} → {self.recipient_id}"
