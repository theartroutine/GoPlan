from __future__ import annotations

from collections.abc import Sequence, Sized
from decimal import Decimal, InvalidOperation
from functools import lru_cache

from django.db import transaction
from django.db.models import Prefetch

from expenses.models import (
    Expense,
    ExpenseContribution,
    ExpenseLedgerEntry,
    ExpenseLedgerEventType,
    ExpenseParticipant,
)
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus
from trips.services import (
    NotTripMemberError,
    TripNotFoundError,
    TripPermissionError,
    TripTerminalError,
)


ZERO_DECIMAL_CURRENCIES = {"VND", "JPY", "KRW"}
MAX_OPTIMAL_SETTLEMENT_PARTICIPANTS = 16


class ExpenseServiceError(Exception):
    error_code: str = "EXPENSE_ERROR"


class ExpenseLockedError(ExpenseServiceError):
    error_code = "EXPENSE_LOCKED"


class ExpenseNotFoundError(ExpenseServiceError):
    error_code = "EXPENSE_NOT_FOUND"


class ContributionUserNotParticipantError(ExpenseServiceError):
    error_code = "CONTRIBUTION_USER_NOT_PARTICIPANT"


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


def _get_member_trip(trip_id, actor) -> tuple[Trip, TripMember]:
    try:
        trip = Trip.objects.get(pk=trip_id)
    except Trip.DoesNotExist:
        raise TripNotFoundError("Trip not found.")

    try:
        membership = TripMember.objects.get(
            trip=trip,
            user=actor,
            status=MemberStatus.ACTIVE,
        )
    except TripMember.DoesNotExist:
        raise NotTripMemberError("You are not an active member of this trip.")

    return trip, membership


def _get_expense_for_update(trip: Trip, expense_id) -> Expense:
    try:
        return Expense.objects.select_for_update().get(pk=expense_id, trip=trip)
    except Expense.DoesNotExist:
        raise ExpenseNotFoundError("Expense not found.")


def _assert_expense_unlocked(expense: Expense) -> None:
    if expense.locked_at is not None:
        raise ExpenseLockedError("Locked expenses cannot be changed.")


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


def normalize_non_negative_currency_amount(amount: Decimal, currency_code: str) -> Decimal:
    quantum = currency_amount_quantum(currency_code)
    try:
        normalized_amount = amount.quantize(quantum)
    except InvalidOperation as exc:
        raise ExpenseServiceError("Invalid amount for this currency.") from exc

    if amount != normalized_amount:
        raise ExpenseServiceError("Amount has too many decimal places for this currency.")

    if normalized_amount < 0:
        raise ExpenseServiceError("Amount must be greater than or equal to zero.")

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
    participants: int | Sized,
    currency_code: str = "VND",
) -> list[Decimal]:
    participant_count = participants if isinstance(participants, int) else len(participants)
    if participant_count <= 0:
        raise ExpenseServiceError("At least one participant is required.")

    normalized_total = normalize_currency_amount(total, currency_code)
    total_minor_units = amount_to_minor_units(normalized_total, currency_code)
    base_share, remainder = divmod(total_minor_units, participant_count)

    return [
        minor_units_to_amount(base_share + (1 if index < remainder else 0), currency_code)
        for index in range(participant_count)
    ]


def _partition_signature(
    partition: tuple[tuple[int, ...], ...],
    key_strings: Sequence[str],
) -> tuple[tuple[str, ...], ...]:
    return tuple(
        sorted(tuple(key_strings[index] for index in group) for group in partition)
    )


def _max_zero_sum_partition(items: Sequence[tuple[object, Decimal]]) -> tuple[tuple[int, ...], ...]:
    item_count = len(items)
    key_strings = [str(user_key) for user_key, _balance in items]
    subset_sums: dict[int, Decimal] = {0: Decimal("0")}

    for mask in range(1, 1 << item_count):
        lowest_bit = mask & -mask
        lowest_bit_index = lowest_bit.bit_length() - 1
        subset_sums[mask] = subset_sums[mask ^ lowest_bit] + items[lowest_bit_index][1]

    @lru_cache(maxsize=None)
    def best_partition(mask: int) -> tuple[tuple[int, ...], ...]:
        if mask == 0:
            return ()

        first_bit = mask & -mask
        submask = mask
        best: tuple[tuple[int, ...], ...] | None = None

        while submask:
            if submask & first_bit and subset_sums[submask] == 0:
                group = tuple(index for index in range(item_count) if submask & (1 << index))
                remainder_partition = best_partition(mask ^ submask)
                candidate = (group, *remainder_partition)

                if best is None or len(candidate) > len(best):
                    best = candidate
                elif len(candidate) == len(best) and _partition_signature(
                    candidate,
                    key_strings,
                ) < _partition_signature(best, key_strings):
                    best = candidate

            submask = (submask - 1) & mask

        if best is None:
            return (tuple(index for index in range(item_count) if mask & (1 << index)),)

        return best

    full_mask = (1 << item_count) - 1
    partition = best_partition(full_mask)
    return tuple(
        sorted(
            partition,
            key=lambda group: tuple(key_strings[index] for index in group),
        )
    )


def _build_group_transfers(group_items: Sequence[tuple[object, Decimal]]) -> list[dict[str, object]]:
    debtors = [(user_key, -balance) for user_key, balance in group_items if balance < 0]
    creditors = [(user_key, balance) for user_key, balance in group_items if balance > 0]

    transfers: list[dict[str, object]] = []
    debtor_index = 0
    creditor_index = 0

    while debtor_index < len(debtors) and creditor_index < len(creditors):
        debtor_key, debt_amount = debtors[debtor_index]
        creditor_key, credit_amount = creditors[creditor_index]
        transfer_amount = min(debt_amount, credit_amount)

        transfers.append(
            {
                "payer": debtor_key,
                "recipient": creditor_key,
                "amount": transfer_amount,
            }
        )

        debt_amount -= transfer_amount
        credit_amount -= transfer_amount

        if debt_amount == 0:
            debtor_index += 1
        else:
            debtors[debtor_index] = (debtor_key, debt_amount)

        if credit_amount == 0:
            creditor_index += 1
        else:
            creditors[creditor_index] = (creditor_key, credit_amount)

    return transfers


def build_settlement_transfers(balances: dict[str, Decimal]) -> list[dict[str, object]]:
    """Build minimum-count settlement transfers for balances keyed by unique user ID strings."""
    if sum(balances.values(), Decimal("0")) != 0:
        raise ExpenseServiceError("Settlement balances must net to zero.")

    items = sorted(
        ((user_key, balance) for user_key, balance in balances.items() if balance != 0),
        key=lambda item: str(item[0]),
    )
    if not items:
        return []
    if len(items) > MAX_OPTIMAL_SETTLEMENT_PARTICIPANTS:
        raise ExpenseServiceError("Settlement has too many non-zero balances to optimize safely.")

    transfers: list[dict[str, object]] = []
    for group in _max_zero_sum_partition(items):
        group_items = [items[index] for index in group]
        transfers.extend(_build_group_transfers(group_items))

    return transfers


@transaction.atomic
def set_contribution(
    *,
    trip_id,
    expense_id,
    target_user_id,
    actor,
    amount: Decimal,
) -> ExpenseContribution:
    trip, membership = _get_member_trip(trip_id, actor)
    if membership.role != TripRole.CAPTAIN:
        raise TripPermissionError("Only the trip captain can perform this action.")

    expense = _get_expense_for_update(trip, expense_id)
    _assert_expense_unlocked(expense)
    normalized_amount = normalize_non_negative_currency_amount(amount, expense.currency_code)

    if not ExpenseParticipant.objects.filter(expense=expense, user_id=target_user_id).exists():
        raise ContributionUserNotParticipantError(
            "Contribution user must be in the expense participant snapshot."
        )

    contribution, _created = ExpenseContribution.objects.update_or_create(
        expense=expense,
        user_id=target_user_id,
        defaults={
            "amount": normalized_amount,
            "updated_by": actor,
        },
    )

    ExpenseLedgerEntry.objects.create(
        trip=trip,
        expense=expense,
        actor=actor,
        event_type=ExpenseLedgerEventType.CONTRIBUTION_SET,
        payload={
            "user_id": str(target_user_id),
            "amount": str(normalized_amount),
        },
    )

    return contribution


def _expense_financials(expense: Expense) -> dict[str, object]:
    participants = list(expense.participants.all())
    contributions_by_user_id = {
        contribution.user_id: contribution.amount
        for contribution in expense.contributions.all()
    }
    paid_total = sum(contributions_by_user_id.values(), Decimal("0"))
    surplus = max(paid_total - expense.total_amount, Decimal("0"))
    missing = max(expense.total_amount - paid_total, Decimal("0"))

    balances: dict[str, Decimal] = {}
    for participant in participants:
        user_key = str(participant.user_id)
        paid_amount = contributions_by_user_id.get(participant.user_id, Decimal("0"))
        balances[user_key] = paid_amount - participant.share_amount

    if surplus > 0:
        collector_key = str(expense.collector_id)
        balances[collector_key] = balances.get(collector_key, Decimal("0")) - surplus

    return {
        "paid_amount": paid_total,
        "surplus_amount": surplus,
        "missing_amount": missing,
        "balances": balances,
    }


def build_expense_dashboard(*, trip_id, actor) -> dict[str, object]:
    trip, membership = _get_member_trip(trip_id, actor)
    expenses = (
        Expense.objects.filter(trip=trip)
        .select_related("collector", "created_by")
        .prefetch_related(
            Prefetch("participants", queryset=ExpenseParticipant.objects.select_related("user")),
            Prefetch("contributions", queryset=ExpenseContribution.objects.select_related("user")),
        )
        .order_by("-created_at")
    )

    total_amount = Decimal("0")
    paid_amount = Decimal("0")
    surplus_amount = Decimal("0")
    missing_amount = Decimal("0")
    expense_rows: list[dict[str, object]] = []
    member_balances: dict[str, dict[str, Decimal]] = {}

    for expense in expenses:
        financials = _expense_financials(expense)
        expense_rows.append({"expense": expense, "financials": financials})

        total_amount += expense.total_amount
        paid_amount += financials["paid_amount"]
        surplus_amount += financials["surplus_amount"]
        missing_amount += financials["missing_amount"]

        for user_key, balance in financials["balances"].items():
            if user_key not in member_balances:
                member_balances[user_key] = {"balance": Decimal("0")}
            member_balances[user_key]["balance"] += balance

    return {
        "trip": trip,
        "permissions": {"can_manage_expenses": membership.role == TripRole.CAPTAIN},
        "summary": {
            "total_amount": total_amount,
            "paid_amount": paid_amount,
            "surplus_amount": surplus_amount,
            "missing_amount": missing_amount,
        },
        "expenses": expense_rows,
        "member_balances": member_balances,
    }


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
