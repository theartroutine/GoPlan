from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import transaction

from expenses.models import (
    Expense,
    ExpenseLedgerEntry,
    ExpenseLedgerEventType,
    ExpenseParticipant,
)
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus
from trips.services import TripNotFoundError, TripPermissionError, TripTerminalError


ZERO_DECIMAL_CURRENCIES = {"VND", "JPY", "KRW"}


class ExpenseServiceError(Exception):
    error_code: str = "EXPENSE_ERROR"


class ExpenseLockedError(ExpenseServiceError):
    error_code = "EXPENSE_LOCKED"


def _assert_captain(trip: Trip, actor) -> None:
    if not TripMember.objects.filter(
        trip=trip,
        user=actor,
        role=TripRole.CAPTAIN,
        status=MemberStatus.ACTIVE,
    ).exists():
        raise TripPermissionError("Only the trip captain can perform this action.")


def _assert_trip_open_for_expenses(trip: Trip) -> None:
    if trip.status == TripStatus.CANCELLED:
        raise TripTerminalError("Cancelled trips cannot accept expenses.")


def currency_minor_unit_factor(currency_code: str) -> int:
    normalized_code = currency_code.upper()
    if normalized_code in ZERO_DECIMAL_CURRENCIES:
        return 1
    return 100


def currency_amount_quantum(currency_code: str) -> Decimal:
    normalized_code = currency_code.upper()
    if normalized_code in ZERO_DECIMAL_CURRENCIES:
        return Decimal("1")
    return Decimal("0.01")


def normalize_currency_amount(amount: Decimal, currency_code: str) -> Decimal:
    quantum = currency_amount_quantum(currency_code)
    try:
        normalized_amount = amount.quantize(quantum)
    except InvalidOperation as exc:
        raise ExpenseServiceError("Invalid amount for this currency.") from exc

    if amount != normalized_amount:
        raise ExpenseServiceError("Amount has too many decimal places for this currency.")

    if normalized_amount <= 0:
        raise ExpenseServiceError("Amount must be greater than zero.")

    return normalized_amount


def amount_to_minor_units(amount: Decimal, currency_code: str) -> int:
    amount = normalize_currency_amount(amount, currency_code)
    factor = currency_minor_unit_factor(currency_code)
    return int(amount * factor)


def minor_units_to_amount(amount: int, currency_code: str) -> Decimal:
    factor = currency_minor_unit_factor(currency_code)
    return (Decimal(amount) / Decimal(factor)).quantize(currency_amount_quantum(currency_code))


def split_amount_evenly(
    total: Decimal,
    participants: int,
    currency_code: str = "VND",
) -> list[Decimal]:
    if participants <= 0:
        raise ExpenseServiceError("At least one participant is required.")

    normalized_total = normalize_currency_amount(total, currency_code)
    total_minor_units = amount_to_minor_units(normalized_total, currency_code)
    base_share, remainder = divmod(total_minor_units, participants)

    return [
        minor_units_to_amount(base_share + (1 if index < remainder else 0), currency_code)
        for index in range(participants)
    ]


@transaction.atomic
def create_expense(
    *,
    trip_id,
    actor,
    title: str,
    total_amount: Decimal,
    description: str = "",
    collector=None,
) -> Expense:
    try:
        trip = Trip.objects.select_for_update().get(pk=trip_id)
    except Trip.DoesNotExist:
        raise TripNotFoundError("Trip not found.")

    _assert_captain(trip, actor)
    _assert_trip_open_for_expenses(trip)

    active_memberships = list(
        TripMember.objects.select_related("user")
        .filter(trip=trip, status=MemberStatus.ACTIVE)
        .order_by("joined_at", "id")
    )
    normalized_total_amount = normalize_currency_amount(total_amount, trip.currency_code)
    shares = split_amount_evenly(normalized_total_amount, len(active_memberships), trip.currency_code)
    collector = collector or actor
    active_member_ids = {membership.user_id for membership in active_memberships}
    if collector.id not in active_member_ids:
        raise ExpenseServiceError("Collector must be an active trip member.")

    expense = Expense.objects.create(
        trip=trip,
        title=title,
        description=description,
        total_amount=normalized_total_amount,
        currency_code=trip.currency_code,
        collector=collector,
        created_by=actor,
    )

    ExpenseParticipant.objects.bulk_create(
        [
            ExpenseParticipant(
                expense=expense,
                user=membership.user,
                display_name_snapshot=membership.user.display_name,
                identify_tag_snapshot=membership.user.identify_tag,
                share_amount=share_amount,
            )
            for membership, share_amount in zip(active_memberships, shares, strict=True)
        ]
    )

    ExpenseLedgerEntry.objects.create(
        trip=trip,
        expense=expense,
        actor=actor,
        event_type=ExpenseLedgerEventType.EXPENSE_CREATED,
        payload={
            "expense_id": str(expense.id),
            "total_amount": str(expense.total_amount),
            "currency_code": expense.currency_code,
        },
    )

    return expense
