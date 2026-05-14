from __future__ import annotations

from collections.abc import Iterable

MISSING_FIELD_DEFINITIONS = {
    "activity_id": {"label": "Activity"},
    "amount": {"label": "Amount", "type": "money"},
    "collector_id": {"label": "Collector", "type": "select"},
    "contributions": {"label": "Contributions", "type": "json"},
    "custom_type_id": {"label": "Custom activity type", "type": "select"},
    "data": {"label": "Activity details", "type": "json"},
    "end_time": {"label": "End time"},
    "expense_id": {"label": "Expense"},
    "location_mode": {"label": "Location mode", "type": "select"},
    "member_contributions": {"label": "Member contributions", "type": "json"},
    "place": {"label": "Place", "type": "json"},
    "section_id": {"label": "Timeline day"},
    "start_time": {"label": "Start time"},
    "status": {"label": "Status", "type": "select"},
    "system_type": {"label": "Activity type", "type": "select"},
    "time_mode": {"label": "Time mode", "type": "select"},
    "title": {"label": "Title"},
    "total_amount": {"label": "Amount", "type": "money"},
    "transfer_id": {"label": "Transfer"},
    "user_id": {"label": "Member"},
}


def missing_field_name(field) -> str:
    if isinstance(field, dict):
        return str(field.get("name") or "").strip()
    return str(field or "").strip()


def normalize_missing_field_names(value, *, strict: bool = True) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        if strict:
            raise ValueError("Agent draft missing_fields must be a list.")
        return []

    names = []
    for item in value:
        name = missing_field_name(item)
        if not name:
            if strict:
                raise ValueError("Agent draft missing field must include a name.")
            continue
        names.append(name)
    return list(dict.fromkeys(names))


def build_missing_field(name: str, *, source: dict | None = None) -> dict:
    definition = MISSING_FIELD_DEFINITIONS.get(name, {})
    label = ""
    field_type = None
    if source:
        raw_label = source.get("label")
        raw_type = source.get("type")
        label = str(raw_label).strip() if raw_label else ""
        field_type = str(raw_type).strip() if raw_type else None
    if not label:
        label = definition.get("label") or name.replace("_", " ").title()
    if field_type is None:
        field_type = definition.get("type")

    field = {"name": name, "label": label}
    if field_type:
        field["type"] = field_type
    return field


def normalize_missing_fields(value, *, strict: bool = True) -> list[dict]:
    if value is None:
        return []
    if not isinstance(value, list):
        if strict:
            raise ValueError("Agent draft missing_fields must be a list.")
        return []

    sources = {}
    ordered_names = []
    for item in value:
        name = missing_field_name(item)
        if not name:
            if strict:
                raise ValueError("Agent draft missing field must include a name.")
            continue
        if name not in ordered_names:
            ordered_names.append(name)
        if isinstance(item, dict):
            sources[name] = item

    return [
        build_missing_field(name, source=sources.get(name))
        for name in ordered_names
    ]


def build_missing_fields(names: Iterable[str]) -> list[dict]:
    return [build_missing_field(name) for name in list(dict.fromkeys(names))]
