from __future__ import annotations


TOP_LEVEL_PREVIEW_FIELDS = (
    "title",
    "total_amount",
    "description",
    "currency_code",
    "collector_id",
    "expense_id",
    "activity_id",
    "transfer_id",
    "status",
    "scope",
    "user_id",
    "amount",
    "contributions",
    "member_contributions",
)

TIMELINE_ACTIVITY_PREVIEW_FIELDS = (
    "title",
    "time_mode",
    "start_time",
    "end_time",
    "location_mode",
    "location_label",
    "system_type",
    "custom_type_id",
    "assignee_scope",
    "assignee_user_id",
)


def build_action_preview(*, action_type: str, payload: dict) -> dict:
    """Build a server-owned confirmation preview from the executable payload."""
    preview = {}
    for field in TOP_LEVEL_PREVIEW_FIELDS:
        if field in payload:
            preview[field] = payload[field]
    for field, value in payload.items():
        if field == "data" or field in preview:
            continue
        preview[field] = value

    activity_data = payload.get("data")
    if isinstance(activity_data, dict):
        for field in TIMELINE_ACTIVITY_PREVIEW_FIELDS:
            if field in activity_data:
                preview[field] = activity_data[field]
        for field, value in activity_data.items():
            if field in preview:
                continue
            preview[field] = value

    if action_type:
        preview["action_type"] = action_type
    return preview
