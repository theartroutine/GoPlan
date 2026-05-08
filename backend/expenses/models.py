from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class ExpenseLedgerEventType(models.TextChoices):
    EXPENSE_CREATED = "EXPENSE_CREATED", "Expense created"
    EXPENSE_UPDATED = "EXPENSE_UPDATED", "Expense updated"
    EXPENSE_DELETED = "EXPENSE_DELETED", "Expense deleted"
    CONTRIBUTION_SET = "CONTRIBUTION_SET", "Contribution set"
    CONTRIBUTION_REMOVED = "CONTRIBUTION_REMOVED", "Contribution removed"
    SETTLEMENT_FINALIZED = "SETTLEMENT_FINALIZED", "Settlement finalized"
    SETTLEMENT_REOPENED = "SETTLEMENT_REOPENED", "Settlement reopened"
    TRANSFER_MARKED_SENT = "TRANSFER_MARKED_SENT", "Transfer marked sent"
    TRANSFER_CONFIRMED_RECEIVED = "TRANSFER_CONFIRMED_RECEIVED", "Transfer confirmed received"


class SettlementStatus(models.TextChoices):
    FINALIZED = "FINALIZED", "Finalized"
    REOPENED = "REOPENED", "Reopened"


class Expense(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="expenses")
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency_code = models.CharField(max_length=3)
    collector = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="collected_expenses",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_expenses",
    )
    locked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["trip", "created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(total_amount__gt=0),
                name="expense_total_amount_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.total_amount} {self.currency_code})"


class ExpenseParticipant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="expense_participations",
    )
    display_name_snapshot = models.CharField(max_length=161)
    identify_tag_snapshot = models.CharField(max_length=32, null=True, blank=True)
    share_amount = models.DecimalField(max_digits=14, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(fields=["expense", "user"], name="expenseparticipant_unique_expense_user"),
            models.CheckConstraint(
                condition=Q(share_amount__gte=0),
                name="expenseparticipant_share_amount_non_negative",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} owes {self.share_amount} for {self.expense_id}"


class ExpenseContribution(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name="contributions")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="expense_contributions",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["updated_at"]
        constraints = [
            models.UniqueConstraint(fields=["expense", "user"], name="expensecontribution_unique_expense_user"),
            models.CheckConstraint(
                condition=Q(amount__gte=0),
                name="expensecontribution_amount_non_negative",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} paid {self.amount} for {self.expense_id}"


class TripSettlement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="settlements")
    status = models.CharField(max_length=12, choices=SettlementStatus.choices)
    finalized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    finalized_at = models.DateTimeField(null=True, blank=True)
    reopened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    reopened_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["trip", "status", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["trip"],
                condition=Q(status=SettlementStatus.FINALIZED),
                name="tripsettlement_unique_finalized_per_trip",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.trip_id} settlement ({self.status})"


class SettlementTransfer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    settlement = models.ForeignKey(TripSettlement, on_delete=models.CASCADE, related_name="transfers")
    payer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="settlement_payments",
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="settlement_receipts",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    payer_marked_sent_at = models.DateTimeField(null=True, blank=True)
    recipient_confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="settlementtransfer_amount_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.payer_id} pays {self.recipient_id} {self.amount}"


class ExpenseLedgerEntry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="expense_ledger_entries")
    expense = models.ForeignKey(
        Expense,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ledger_entries",
    )
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    event_type = models.CharField(max_length=32, choices=ExpenseLedgerEventType.choices)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["trip", "created_at"]),
            models.Index(fields=["expense", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.event_type} on {self.trip_id}"
