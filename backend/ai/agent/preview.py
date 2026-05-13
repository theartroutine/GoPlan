from __future__ import annotations


TOP_LEVEL_PREVIEW_FIELDS = (
    "title",
    "total_amount",
    "description",
    "currency_code",
    "expense_id",
    "activity_id",
    "transfer_id",
    "status",
    "scope",
    "user_id",
    "amount",
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

    activity_data = payload.get("data")
    if isinstance(activity_data, dict):
        for field in TIMELINE_ACTIVITY_PREVIEW_FIELDS:
            if field in activity_data:
                preview[field] = activity_data[field]

    if action_type:
        preview["action_type"] = action_type
    return preview
