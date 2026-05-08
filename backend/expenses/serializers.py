from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from expenses.services import currency_amount_quantum


def format_decimal(value: Decimal, currency_code: str | None = None) -> str:
    if currency_code:
        quantum = currency_amount_quantum(currency_code)
        decimal_places = max(0, -quantum.as_tuple().exponent)
        return format(value.quantize(quantum), f".{decimal_places}f")

    formatted = format(value, "f")
    if "." not in formatted:
        return formatted
    return formatted.rstrip("0").rstrip(".") or "0"


class CreateExpenseSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    collector_id = serializers.UUIDField(required=False)


class UpdateExpenseSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    total_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
    )
    collector_id = serializers.UUIDField(required=False)


class SetContributionSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"))


def serialize_user(user) -> dict[str, object]:
    return {
        "id": str(user.id),
        "display_name": user.display_name,
        "identify_tag": user.identify_tag,
    }


class ExpenseResponseSerializer(serializers.Serializer):
    def to_representation(self, expense):
        return {
            "id": str(expense.id),
            "title": expense.title,
            "description": expense.description,
            "total_amount": format_decimal(expense.total_amount, expense.currency_code),
            "currency_code": expense.currency_code,
            "locked_at": expense.locked_at,
            "created_at": expense.created_at,
        }


class ContributionResponseSerializer(serializers.Serializer):
    def to_representation(self, contribution):
        return {
            "id": str(contribution.id),
            "user": serialize_user(contribution.user),
            "amount": format_decimal(contribution.amount, contribution.expense.currency_code),
            "updated_at": contribution.updated_at,
        }


class SettlementTransferSerializer(serializers.Serializer):
    def to_representation(self, transfer):
        currency_code = self.context.get("currency_code") or transfer.settlement.trip.currency_code
        return {
            "id": str(transfer.id),
            "payer": serialize_user(transfer.payer),
            "recipient": serialize_user(transfer.recipient),
            "amount": format_decimal(transfer.amount, currency_code),
            "payer_marked_sent_at": transfer.payer_marked_sent_at,
            "recipient_confirmed_at": transfer.recipient_confirmed_at,
        }


class TripSettlementSerializer(serializers.Serializer):
    def to_representation(self, settlement):
        currency_code = settlement.trip.currency_code
        return {
            "id": str(settlement.id),
            "status": settlement.status,
            "finalized_at": settlement.finalized_at,
            "transfers": SettlementTransferSerializer(
                settlement.transfers.all(),
                many=True,
                context={"currency_code": currency_code},
            ).data,
        }


def _expense_status(financials: dict[str, object]) -> str:
    if financials["surplus_amount"] > 0:
        return "OVERFUNDED"
    if financials["missing_amount"] == 0:
        return "FUNDED"
    return "UNDERFUNDED"


def serialize_dashboard_response(dashboard: dict[str, object], *, request_user) -> dict[str, object]:
    currency_code = dashboard["currency_code"]
    member_balances = {
        user_id: {"balance": format_decimal(row["balance"], currency_code)}
        for user_id, row in dashboard["member_balances"].items()
    }
    request_user_key = str(request_user.id)
    request_user_row = dashboard["member_balances"].get(request_user_key)
    if request_user_row:
        my_balance = {
            "balance": format_decimal(request_user_row["personal_balance"], currency_code),
            "surplus_held": format_decimal(request_user_row["surplus_held"], currency_code),
        }
    else:
        my_balance = {
            "balance": format_decimal(Decimal("0"), currency_code),
            "surplus_held": format_decimal(Decimal("0"), currency_code),
        }

    return {
        "currency_code": currency_code,
        "summary": {
            "total_amount": format_decimal(dashboard["summary"]["total_amount"], currency_code),
            "paid_amount": format_decimal(dashboard["summary"]["paid_amount"], currency_code),
            "missing_amount": format_decimal(dashboard["summary"]["missing_amount"], currency_code),
            "surplus_amount": format_decimal(dashboard["summary"]["surplus_amount"], currency_code),
        },
        "permissions": dashboard["permissions"],
        "my_balance": my_balance,
        "member_balances": member_balances,
        "settlement": (
            TripSettlementSerializer(dashboard["settlement"]).data
            if dashboard.get("settlement") is not None
            else None
        ),
        "expenses": [
            {
                "id": str(row["expense"].id),
                "title": row["expense"].title,
                "description": row["expense"].description,
                "total_amount": format_decimal(row["expense"].total_amount, row["expense"].currency_code),
                "paid_amount": format_decimal(row["financials"]["paid_amount"], row["expense"].currency_code),
                "missing_amount": format_decimal(row["financials"]["missing_amount"], row["expense"].currency_code),
                "surplus_amount": format_decimal(row["financials"]["surplus_amount"], row["expense"].currency_code),
                "currency_code": row["expense"].currency_code,
                "status": _expense_status(row["financials"]),
                "collector": serialize_user(row["expense"].collector),
                "locked": row["expense"].locked_at is not None,
            }
            for row in dashboard["expenses"]
        ],
    }


def serialize_expense_detail_response(detail: dict[str, object]) -> dict[str, object]:
    expense = detail["expense"]
    financials = detail["financials"]
    contributions_by_user_id = {
        contribution.user_id: contribution.amount
        for contribution in expense.contributions.all()
    }

    return {
        "id": str(expense.id),
        "title": expense.title,
        "description": expense.description,
        "total_amount": format_decimal(expense.total_amount, expense.currency_code),
        "paid_amount": format_decimal(financials["paid_amount"], expense.currency_code),
        "missing_amount": format_decimal(financials["missing_amount"], expense.currency_code),
        "surplus_amount": format_decimal(financials["surplus_amount"], expense.currency_code),
        "currency_code": expense.currency_code,
        "status": _expense_status(financials),
        "collector": serialize_user(expense.collector),
        "locked": expense.locked_at is not None,
        "locked_at": expense.locked_at,
        "created_at": expense.created_at,
        "permissions": detail["permissions"],
        "participants": [
            {
                "user_id": str(participant.user_id),
                "display_name": participant.display_name_snapshot,
                "identify_tag": participant.identify_tag_snapshot,
                "share_amount": format_decimal(participant.share_amount, expense.currency_code),
                "contributed_amount": format_decimal(
                    contributions_by_user_id.get(participant.user_id, Decimal("0")),
                    expense.currency_code,
                ),
                "balance": format_decimal(
                    financials["personal_balances"].get(str(participant.user_id), Decimal("0")),
                    expense.currency_code,
                ),
                "surplus_held": format_decimal(
                    financials["surplus_amount"]
                    if str(participant.user_id) == str(expense.collector_id)
                    else Decimal("0"),
                    expense.currency_code,
                ),
            }
            for participant in expense.participants.all()
        ],
    }
