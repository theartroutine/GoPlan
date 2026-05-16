from __future__ import annotations

import logging
from datetime import datetime, time
from decimal import Decimal
from typing import Callable
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

SYSTEM_TYPE_LABELS = {
    "TRANSPORTATION": "Transportation",
    "FOOD": "Food",
    "CHECKIN_OUT": "Check-in / Check-out",
    "FREE_TIME": "Free Time",
    "SIGHTSEEING": "Sightseeing",
    "SHOPPING": "Shopping",
    "ACCOMMODATION": "Accommodation",
    "OTHER": "Other",
    "DINING": "Food",
    "NIGHTLIFE": "Nightlife",
    "TRANSPORT": "Transportation",
}

ASSIGNEE_LABELS = {
    "GROUP": "Whole group",
    "EVERYONE": "Whole group",
    "USER": "Assigned member",
    "NONE": "Unassigned",
}


def _activity_payload(payload: dict) -> dict:
    data = payload.get("data")
    return data if isinstance(data, dict) else payload


def _non_empty_string(payload: dict, key: str) -> str | None:
    value = payload.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _fmt_clock(value, tz: str) -> str | None:
    if not value:
        return None
    if isinstance(value, time):
        return value.strftime("%H:%M")
    if isinstance(value, datetime):
        dt = value.astimezone(ZoneInfo(tz)) if value.tzinfo else value
        return dt.strftime("%H:%M")
    text = str(value).strip()
    if not text:
        return None
    try:
        if "T" in text:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if dt.tzinfo:
                dt = dt.astimezone(ZoneInfo(tz))
            return dt.strftime("%H:%M")
        parsed_time = time.fromisoformat(text)
        return parsed_time.strftime("%H:%M")
    except ValueError:
        return text[:5] if len(text) >= 5 else text


def _fmt_time_range(start, end, tz: str, time_mode: str | None = None) -> str | None:
    if not start:
        if time_mode == "ALL_DAY":
            return "All day"
        if time_mode == "FLEXIBLE":
            return "Flexible"
        return None
    label = _fmt_clock(start, tz)
    if not label:
        return None
    if end:
        end_label = _fmt_clock(end, tz)
        if end_label:
            label += " – " + end_label
    return label


def _fmt_amount(value: int | str | Decimal, currency: str) -> dict:
    amount = Decimal(str(value))
    formatted = f"{amount:,.0f}" if amount == amount.to_integral_value() else f"{amount:,}"
    return {"kind": "amount", "value": formatted, "currency": currency}


def _location_label(payload: dict) -> str | None:
    label = _non_empty_string(payload, "location_label")
    if label:
        return label
    place = payload.get("place")
    if not isinstance(place, dict):
        return None
    title = _non_empty_string(place, "title")
    if title:
        return title
    return _non_empty_string(place, "address")


def _activity_meta(payload: dict) -> list[dict]:
    meta = []
    for label, field in (
        ("Meeting point", "meeting_point"),
        ("Location note", "location_note"),
        ("Note", "note"),
    ):
        value = _non_empty_string(payload, field)
        if value:
            meta.append({"label": label, "value": value})

    contact_name = _non_empty_string(payload, "contact_name")
    contact_phone = _non_empty_string(payload, "contact_phone")
    if contact_name and contact_phone:
        meta.append(
            {"label": "Contact", "value": f"{contact_name} · {contact_phone}"}
        )
    elif contact_name:
        meta.append({"label": "Contact", "value": contact_name})
    elif contact_phone:
        meta.append({"label": "Contact phone", "value": contact_phone})

    for label, field in (
        ("Booking", "booking_reference"),
        ("Link", "external_link"),
    ):
        value = _non_empty_string(payload, field)
        if value:
            meta.append({"label": label, "value": value})
    return meta


def _build_timeline_activity(*, payload: dict, trip_context: dict, tone: str) -> dict:
    activity_payload = _activity_payload(payload)
    tz = trip_context.get("timezone", "UTC")
    system_label = SYSTEM_TYPE_LABELS.get(
        activity_payload.get("system_type", ""),
        "Activity",
    )
    chips = []
    time_label = _fmt_time_range(
        activity_payload.get("start_time"),
        activity_payload.get("end_time"),
        tz,
        activity_payload.get("time_mode"),
    )
    if time_label:
        chips.append({"icon": "clock", "label": time_label})
    location_label = _location_label(activity_payload)
    if location_label:
        chips.append({"icon": "map-pin", "label": location_label})
    assignee = ASSIGNEE_LABELS.get(
        activity_payload.get("assignee_scope", "GROUP"),
        "Whole group",
    )
    chips.append({"icon": "users", "label": assignee})
    return {
        "icon": "activity",
        "tone": tone,
        "kicker": f"Activity · {system_label}",
        "title": activity_payload.get("title", ""),
        "chips": chips,
        "meta": _activity_meta(activity_payload),
    }


def _build_timeline_create(payload: dict, trip_context: dict) -> dict:
    return _build_timeline_activity(
        payload=payload,
        trip_context=trip_context,
        tone="create",
    )


def _build_timeline_update(payload: dict, trip_context: dict) -> dict:
    return _build_timeline_activity(
        payload=payload,
        trip_context=trip_context,
        tone="update",
    )


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
