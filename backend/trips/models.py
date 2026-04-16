from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q


# -------- Status / Role Choices --------

class TripStatus(models.TextChoices):
    PLANNING   = "PLANNING",   "Planning"
    ONGOING    = "ONGOING",    "Ongoing"
    COMPLETED  = "COMPLETED",  "Completed"
    CANCELLED  = "CANCELLED",  "Cancelled"


class TripRole(models.TextChoices):
    CAPTAIN = "CAPTAIN", "Captain"
    MEMBER  = "MEMBER",  "Member"


class MemberStatus(models.TextChoices):
    ACTIVE  = "ACTIVE",  "Active"
    LEFT    = "LEFT",    "Left"
    REMOVED = "REMOVED", "Removed"


class InvitationStatus(models.TextChoices):
    PENDING   = "PENDING",   "Pending"
    ACCEPTED  = "ACCEPTED",  "Accepted"
    DECLINED  = "DECLINED",  "Declined"
    CANCELLED = "CANCELLED", "Cancelled"


# -------- Models --------

class Trip(models.Model):
    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name            = models.CharField(max_length=120)
    destination     = models.CharField(max_length=200)
    start_date      = models.DateField()
    end_date        = models.DateField()
    description     = models.TextField(blank=True, default="")
    currency_code   = models.CharField(max_length=3, default="VND")
    budget_estimate = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    status          = models.CharField(
        max_length=12,
        choices=TripStatus.choices,
        default=TripStatus.PLANNING,
        db_index=True,
    )
    created_by      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_trips",
    )
    cancelled_at    = models.DateTimeField(null=True, blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_date__gte=F("start_date")),
                name="trip_end_date_gte_start_date",
            )
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.status})"


class TripMember(models.Model):
    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip      = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="memberships")
    user      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="trip_memberships",
    )
    role      = models.CharField(max_length=8, choices=TripRole.choices)
    status    = models.CharField(max_length=8, choices=MemberStatus.choices, default=MemberStatus.ACTIVE)
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at   = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["trip", "user"],
                condition=Q(status="ACTIVE"),
                name="tripmember_unique_active_per_trip",
            )
        ]
        indexes = [
            models.Index(fields=["trip", "status"]),
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} in {self.trip_id} ({self.role}/{self.status})"


class TripInvitation(models.Model):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip         = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="invitations")
    inviter      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_trip_invitations",
    )
    invitee      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_trip_invitations",
    )
    status       = models.CharField(
        max_length=10,
        choices=InvitationStatus.choices,
        default=InvitationStatus.PENDING,
    )
    created_at   = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["trip", "invitee"],
                condition=Q(status="PENDING"),
                name="tripinvitation_unique_pending_per_trip",
            )
        ]
        indexes = [
            models.Index(fields=["trip", "status"]),
            models.Index(fields=["invitee", "status"]),
        ]

    def __str__(self) -> str:
        return f"Invite {self.invitee_id} → {self.trip_id} ({self.status})"
