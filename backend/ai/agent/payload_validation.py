from __future__ import annotations

from ai.action_types import (
    AI_ACTION_EXPENSE_CONTRIBUTION_SET,
    AI_ACTION_EXPENSE_CREATE,
    AI_ACTION_EXPENSE_DELETE,
    AI_ACTION_EXPENSE_UPDATE,
    AI_ACTION_SETTLEMENT_FINALIZE,
    AI_ACTION_SETTLEMENT_REOPEN,
    AI_ACTION_SETTLEMENT_TRANSFER_CONFIRM_RECEIVED,
    AI_ACTION_SETTLEMENT_TRANSFER_MARK_SENT,
    AI_ACTION_TIMELINE_ACTIVITY_CREATE,
    AI_ACTION_TIMELINE_ACTIVITY_DELETE,
    AI_ACTION_TIMELINE_ACTIVITY_STATUS_UPDATE,
    AI_ACTION_TIMELINE_ACTIVITY_UPDATE,
)
from trips.models import TimelineActivityTimeMode

EXPENSE_CONTRIBUTION_USER_FIELDS = (
    "user_id",
    "target_user_id",
    "member_id",
    "payer_id",
    "collector_id",
)

EXPENSE_CONTRIBUTION_AMOUNT_FIELDS = (
    "amount",
    "paid_amount",
    "contribution_amount",
)

TIMELINE_ACTIVITY_DATA_FIELDS = {
    "assignee_scope",
    "assignee_user_id",
    "booking_reference",
    "contact_name",
    "contact_phone",
    "custom_type_id",
    "end_time",
    "external_link",
    "location_label",
    "location_mode",
    "location_note",
    "meeting_point",
    "note",
    "place",
    "reminder_offsets_minutes",
    "start_time",
    "system_type",
    "time_mode",
    "title",
}


def is_blank(value) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    return False


def is_missing_value(value) -> bool:
    if isinstance(value, (dict, list, tuple, set)):
        return not value
    return is_blank(value)


def _has_any_value(payload: dict, fields: tuple[str, ...]) -> bool:
    return any(not is_blank(payload.get(field)) for field in fields)


def _should_mark_all_participants_paid(payload: dict) -> bool:
    return str(payload.get("scope", "")).lower() in {
        "all_participants_paid",
        "all_participants",
        "everyone_paid",
    }


def _has_explicit_contributions(payload: dict) -> bool:
    contributions = payload.get("contributions")
    if isinstance(contributions, list) and bool(contributions):
        return True
    member_contributions = payload.get("member_contributions")
    return isinstance(member_contributions, dict) and bool(member_contributions)


def _with_provider_missing(
    provider_missing_names: list[str],
    *,
    allowed_names: set[str],
    payload: dict,
    data: dict | None = None,
) -> list[str]:
    names = []
    for name in provider_missing_names:
        if name not in allowed_names:
            continue
        value = (
            data.get(name)
            if data is not None and name in data
            else payload.get(name)
        )
        if is_missing_value(value):
            names.append(name)
    return names


def _require_field(names: list[str], payload: dict, field: str) -> None:
    if is_blank(payload.get(field)) and field not in names:
        names.append(field)


def _timeline_create_missing_names(
    payload: dict,
    provider_missing_names: list[str],
) -> list[str]:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    required_fields = ["section_id", "title", "time_mode"]
    time_mode = data.get("time_mode")
    if time_mode == TimelineActivityTimeMode.AT_TIME:
        required_fields.append("start_time")
    if time_mode == TimelineActivityTimeMode.TIME_RANGE:
        required_fields.extend(["start_time", "end_time"])

    names = _with_provider_missing(
        provider_missing_names,
        allowed_names=set(required_fields),
        payload=payload,
        data=data,
    )
    for field in required_fields:
        value = payload.get(field) if field == "section_id" else data.get(field)
        if is_blank(value) and field not in names:
            names.append(field)
    return names


def missing_payload_field_names(
    *,
    action_type: str,
    payload: dict,
    provider_missing_names: list[str] | None = None,
) -> list[str]:
    provider_missing_names = provider_missing_names or []

    if action_type == AI_ACTION_EXPENSE_CREATE:
        names = _with_provider_missing(
            provider_missing_names,
            allowed_names={"title", "total_amount"},
            payload=payload,
        )
        _require_field(names, payload, "title")
        _require_field(names, payload, "total_amount")
        return names

    if action_type == AI_ACTION_EXPENSE_UPDATE:
        names = _with_provider_missing(
            provider_missing_names,
            allowed_names={"expense_id", "title", "total_amount", "description"},
            payload=payload,
        )
        _require_field(names, payload, "expense_id")
        return names

    if action_type == AI_ACTION_EXPENSE_DELETE:
        names = _with_provider_missing(
            provider_missing_names,
            allowed_names={"expense_id"},
            payload=payload,
        )
        _require_field(names, payload, "expense_id")
        return names

    if action_type == AI_ACTION_EXPENSE_CONTRIBUTION_SET:
        names = _with_provider_missing(
            provider_missing_names,
            allowed_names={"expense_id", "user_id", "amount"},
            payload=payload,
        )
        _require_field(names, payload, "expense_id")
        if (
            not _has_explicit_contributions(payload)
            and not _should_mark_all_participants_paid(payload)
        ):
            if not _has_any_value(payload, EXPENSE_CONTRIBUTION_USER_FIELDS):
                names.append("user_id")
            if not _has_any_value(payload, EXPENSE_CONTRIBUTION_AMOUNT_FIELDS):
                names.append("amount")
        return list(dict.fromkeys(names))

    if action_type == AI_ACTION_TIMELINE_ACTIVITY_CREATE:
        return _timeline_create_missing_names(payload, provider_missing_names)

    if action_type == AI_ACTION_TIMELINE_ACTIVITY_UPDATE:
        names = _with_provider_missing(
            provider_missing_names,
            allowed_names={"activity_id", "data"},
            payload=payload,
        )
        _require_field(names, payload, "activity_id")
        data = payload.get("data")
        if (not isinstance(data, dict) or not data) and "data" not in names:
            names.append("data")
        return names

    if action_type == AI_ACTION_TIMELINE_ACTIVITY_DELETE:
        names = _with_provider_missing(
            provider_missing_names,
            allowed_names={"activity_id"},
            payload=payload,
        )
        _require_field(names, payload, "activity_id")
        return names

    if action_type == AI_ACTION_TIMELINE_ACTIVITY_STATUS_UPDATE:
        names = _with_provider_missing(
            provider_missing_names,
            allowed_names={"activity_id", "status"},
            payload=payload,
        )
        _require_field(names, payload, "activity_id")
        _require_field(names, payload, "status")
        return names

    if action_type in {
        AI_ACTION_SETTLEMENT_TRANSFER_MARK_SENT,
        AI_ACTION_SETTLEMENT_TRANSFER_CONFIRM_RECEIVED,
    }:
        names = _with_provider_missing(
            provider_missing_names,
            allowed_names={"transfer_id"},
            payload=payload,
        )
        _require_field(names, payload, "transfer_id")
        return names

    if action_type in {AI_ACTION_SETTLEMENT_FINALIZE, AI_ACTION_SETTLEMENT_REOPEN}:
        return []

    return list(dict.fromkeys(provider_missing_names))
