from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal
from typing import Callable
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

SYSTEM_TYPE_LABELS = {
    "SIGHTSEEING": "Sightseeing",
    "DINING": "Dining",
    "SHOPPING": "Shopping",
    "NIGHTLIFE": "Nightlife",
    "TRANSPORT": "Transport",
    "ACCOMMODATION": "Accommodation",
    "OTHER": "Other",
}

ASSIGNEE_LABELS = {
    "GROUP": "Whole group",
    "USER": "Assigned member",
}


def _fmt_time_range(start: str | None, end: str | None, tz: str) -> str | None:
    if not start:
        return None
    zone = ZoneInfo(tz)
    s = datetime.fromisoformat(start).astimezone(zone)
    label = s.strftime("%H:%M")
    if end:
        e = datetime.fromisoformat(end).astimezone(zone)
        label += " – " + e.strftime("%H:%M")
    return label


def _fmt_amount(value: int | str | Decimal, currency: str) -> dict:
    amount = Decimal(str(value))
    formatted = f"{amount:,.0f}" if amount == amount.to_integral_value() else f"{amount:,}"
    return {"kind": "amount", "value": formatted, "currency": currency}


def _build_timeline_activity(*, payload: dict, trip_context: dict, tone: str) -> dict:
    tz = trip_context.get("timezone", "UTC")
    system_label = SYSTEM_TYPE_LABELS.get(payload.get("system_type", ""), "Activity")
    chips = []
    time_label = _fmt_time_range(payload.get("start_time"), payload.get("end_time"), tz)
    if time_label:
        chips.append({"icon": "clock", "label": time_label})
    if payload.get("location_label"):
        chips.append({"icon": "map-pin", "label": payload["location_label"]})
    assignee = ASSIGNEE_LABELS.get(payload.get("assignee_scope", "GROUP"), "Whole group")
    chips.append({"icon": "users", "label": assignee})
    return {
        "icon": "activity",
        "tone": tone,
        "kicker": f"Activity · {system_label}",
        "title": payload.get("title", ""),
        "chips": chips,
    }


def _build_timeline_create(payload: dict, trip_context: dict) -> dict:
    return _build_timeline_activity(payload=payload, trip_context=trip_context, tone="create")


def _build_timeline_update(payload: dict, trip_context: dict) -> dict:
    return _build_timeline_activity(payload=payload, trip_context=trip_context, tone="update")


def _build_timeline_delete(payload: dict, trip_context: dict) -> dict:
    return {
        "icon": "activity",
        "tone": "destroy",
        "kicker": "Delete activity",
        "title": payload.get("title", "Activity"),
    }


def _build_expense_create(payload: dict, trip_context: dict) -> dict:
    currency = payload.get("currency_code") or trip_context.get("currency_code", "USD")
    return {
        "icon": "expense",
        "tone": "create",
        "kicker": "Expense",
        "title": payload.get("title", ""),
        "hero": _fmt_amount(payload.get("total_amount", 0), currency),
        "meta": [
            {"label": "Collected by", "value": payload.get("collector_name", "")}
        ] if payload.get("collector_name") else [],
    }


def _build_expense_update(payload: dict, trip_context: dict) -> dict:
    out = _build_expense_create(payload, trip_context)
    out["tone"] = "update"
    return out


def _build_expense_delete(payload: dict, trip_context: dict) -> dict:
    return {
        "icon": "expense",
        "tone": "destroy",
        "kicker": "Delete expense",
        "title": payload.get("title", "Expense"),
    }


def _build_settlement(payload: dict, trip_context: dict) -> dict:
    return {
        "icon": "settlement",
        "tone": "update",
        "kicker": "Settlement",
        "title": payload.get("title", "Trip settlement"),
    }


def _build_transfer(payload: dict, trip_context: dict) -> dict:
    currency = payload.get("currency_code") or trip_context.get("currency_code", "USD")
    return {
        "icon": "transfer",
        "tone": "update",
        "kicker": "Transfer",
        "title": payload.get("title", "Money transfer"),
        "hero": _fmt_amount(payload.get("amount", 0), currency),
        "meta": [
            {"label": "From", "value": payload.get("from_name", "")},
            {"label": "To", "value": payload.get("to_name", "")},
        ],
    }


def _build_generic(payload: dict, trip_context: dict) -> dict:
    return {
        "icon": "info",
        "tone": "neutral",
        "kicker": "AI action",
        "title": payload.get("title", ""),
    }


DISPLAY_BUILDERS: dict[str, Callable[[dict, dict], dict]] = {
    "timeline.activity.create": _build_timeline_create,
    "timeline.activity.update": _build_timeline_update,
    "timeline.activity.delete": _build_timeline_delete,
    "timeline.activity.status.update": _build_timeline_update,
    "expense.create": _build_expense_create,
    "expense.update": _build_expense_update,
    "expense.delete": _build_expense_delete,
    "expense.contribution.set": _build_expense_update,
    "settlement.finalize": _build_settlement,
    "settlement.reopen": _build_settlement,
    "settlement.transfer.mark_sent": _build_transfer,
    "settlement.transfer.confirm_received": _build_transfer,
}


def build_display(*, action_type: str, payload: dict, trip_context: dict) -> dict:
    builder = DISPLAY_BUILDERS.get(action_type)
    if builder is None:
        logger.warning("ai.display.unknown_action", extra={"action_type": action_type})
        return _build_generic(payload, trip_context)
    return builder(payload, trip_context)
