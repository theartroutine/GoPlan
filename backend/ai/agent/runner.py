from __future__ import annotations

import json
from dataclasses import dataclass

from ai.action_types import (
    AI_ACTION_EXPENSE_CREATE,
    AI_ACTION_TIMELINE_ACTIVITY_CREATE,
    AI_CONFIRMATION_CAPTAIN,
    AI_CONFIRMATION_TIMELINE_ACTIVITY_STATUS,
    AI_CONFIRMATION_TRANSFER_PAYER,
    AI_CONFIRMATION_TRANSFER_RECIPIENT,
    CAPTAIN_MANAGED_ACTIONS,
    SUPPORTED_AI_ACTIONS,
    TIMELINE_ACTIVITY_STATUS_ACTIONS,
    TRANSFER_PAYER_ACTIONS,
    TRANSFER_RECIPIENT_ACTIONS,
)
from ai.agent.context import build_agent_context
from ai.agent.draft_fields import (
    build_missing_fields,
    normalize_missing_field_names,
)
from ai.agent.payload_validation import missing_payload_field_names
from ai.agent.preview import build_action_preview
from ai.deepseek import complete_goplan_ai_agent_prompt
from ai.models import AIActionDraftStatus
from trips.models import TimelineLocationMode

ACTION_TYPE_ALIASES = {
    "add_expense": AI_ACTION_EXPENSE_CREATE,
    "create_expense": AI_ACTION_EXPENSE_CREATE,
    "expense_create": AI_ACTION_EXPENSE_CREATE,
}

ACTION_CONFIRMATION_RULES = {
    **{
        action_type: AI_CONFIRMATION_CAPTAIN
        for action_type in CAPTAIN_MANAGED_ACTIONS
    },
    **{
        action_type: AI_CONFIRMATION_TIMELINE_ACTIVITY_STATUS
        for action_type in TIMELINE_ACTIVITY_STATUS_ACTIONS
    },
    **{
        action_type: AI_CONFIRMATION_TRANSFER_PAYER
        for action_type in TRANSFER_PAYER_ACTIONS
    },
    **{
        action_type: AI_CONFIRMATION_TRANSFER_RECIPIENT
        for action_type in TRANSFER_RECIPIENT_ACTIONS
    },
}


@dataclass(frozen=True)
class AgentDraftSpec:
    action_type: str
    required_confirmation: str
    status: str
    payload: dict
    preview: dict
    missing_fields: list
    preconditions: dict


@dataclass(frozen=True)
class AgentRunResult:
    message: str
    drafts: list[AgentDraftSpec]
    usage: object | None = None


def _parse_json_object(content: str) -> dict:
    try:
        raw = json.loads(content)
    except json.JSONDecodeError as exc:
        stripped = content.strip()
        if stripped.startswith("```"):
            lines = stripped.splitlines()
            if len(lines) >= 3 and lines[-1].strip() == "```":
                stripped = "\n".join(lines[1:-1]).strip()
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("Agent response must be valid JSON.") from exc
        try:
            raw = json.loads(stripped[start : end + 1])
        except json.JSONDecodeError as nested_exc:
            raise ValueError("Agent response must be valid JSON.") from nested_exc

    if not isinstance(raw, dict):
        raise ValueError("Agent response must be a JSON object.")

    return raw


def _normalize_action_type(value) -> str:
    action_type = str(value or "").strip()
    normalized = action_type.lower()
    return ACTION_TYPE_ALIASES.get(normalized, normalized)


def _normalize_confirmation(value, *, action_type: str) -> str:
    try:
        return ACTION_CONFIRMATION_RULES[action_type]
    except KeyError as exc:
        raise ValueError("Agent draft required_confirmation is required.") from exc


def _normalize_timeline_activity_create_payload(payload: dict) -> dict:
    if isinstance(payload.get("data"), dict):
        data = dict(payload["data"])
    else:
        data = {
            key: value
            for key, value in payload.items()
            if key not in {"section_id", "trip_id"}
        }

    def normalize_system_type(value):
        if isinstance(value, dict):
            return value.get("code") or value.get("value") or ""
        return value

    activity_type_code = data.pop("activity_type_code", None)
    activity_type = data.pop("activity_type", None)
    if data.get("system_type"):
        data["system_type"] = normalize_system_type(data["system_type"])
    elif activity_type_code or activity_type:
        data["system_type"] = normalize_system_type(activity_type_code or activity_type)

    location = data.pop("location", None)
    if isinstance(location, dict):
        place = location.get("place")
        location_mode = location.get("location_mode")
        if location_mode == TimelineLocationMode.STRUCTURED and isinstance(place, dict):
            data["location_mode"] = TimelineLocationMode.STRUCTURED
            data["place"] = place
        elif not data.get("location_mode"):
            data["location_mode"] = TimelineLocationMode.MANUAL
        for field in ("location_label", "location_note"):
            if location.get(field) and not data.get(field):
                data[field] = location[field]

    if data.get("location_label") and not data.get("location_mode"):
        data["location_mode"] = TimelineLocationMode.MANUAL
    data.setdefault("reminder_offsets_minutes", [])

    return {
        "section_id": payload.get("section_id"),
        "data": data,
    }


def _normalize_payload(*, action_type: str, payload: dict) -> dict:
    if action_type == AI_ACTION_TIMELINE_ACTIVITY_CREATE:
        return _normalize_timeline_activity_create_payload(payload)
    return payload


def _infer_missing_fields(*, action_type: str, payload: dict, missing_fields: list[str]):
    missing_names = missing_payload_field_names(
        action_type=action_type,
        payload=payload,
        provider_missing_names=missing_fields,
    )
    return build_missing_fields(missing_names)


def _normalize_status(value, *, missing_fields: list[str]) -> str:
    if value:
        normalized = str(value).strip().upper().replace("-", "_").replace(" ", "_")
        if normalized not in {
            AIActionDraftStatus.NEEDS_INFO,
            AIActionDraftStatus.READY,
        }:
            raise ValueError("Agent draft status must be NEEDS_INFO or READY.")
        if missing_fields:
            return AIActionDraftStatus.NEEDS_INFO
        if normalized == AIActionDraftStatus.NEEDS_INFO:
            return AIActionDraftStatus.READY
        return normalized
    if missing_fields:
        return AIActionDraftStatus.NEEDS_INFO
    return AIActionDraftStatus.READY


def _coerce_dict(value, *, field_name: str, default: dict | None = None) -> dict:
    if value is None and default is not None:
        return default
    if not isinstance(value, dict):
        raise ValueError(f"Agent draft {field_name} must be an object.")
    return value


def _coerce_preview(value, *, action_type: str, payload: dict) -> dict:
    if value is not None and not isinstance(value, (str, dict)):
        raise ValueError("Agent draft preview must be an object.")
    return build_action_preview(action_type=action_type, payload=payload)


def _message_claims_completed_action(message: str) -> bool:
    lowered = message.lower()
    return any(
        phrase in lowered
        for phrase in (
            "thành công",
            "hoàn tất",
            "hoàn thành",
            "successfully",
            "completed",
        )
    )


def _build_draft_pending_message(drafts: list[AgentDraftSpec]) -> str:
    if len(drafts) == 1 and drafts[0].action_type == AI_ACTION_EXPENSE_CREATE:
        draft = drafts[0]
        title = draft.preview.get("title") or draft.payload.get("title")
        amount = draft.preview.get("total_amount") or draft.payload.get("total_amount")
        title_text = f" '{title}'" if title else ""
        amount_text = f" với tổng {amount} VND" if amount else ""
        return (
            f"Mình đã chuẩn bị bản nháp tạo khoản chi{title_text}{amount_text}. "
            "Kiểm tra rồi xác nhận nếu đúng."
        )
    return "Mình đã chuẩn bị bản nháp thao tác. Kiểm tra rồi xác nhận nếu đúng."


def parse_agent_response(content: str) -> AgentRunResult:
    raw = _parse_json_object(content)
    message = raw.get("message")
    drafts_raw = raw.get("drafts", [])
    if not isinstance(message, str) or not message.strip():
        raise ValueError("Agent response message must be a non-empty string.")
    if not isinstance(drafts_raw, list):
        raise ValueError("Agent response drafts must be a list.")

    drafts = []
    for draft in drafts_raw:
        if not isinstance(draft, dict):
            raise ValueError("Each draft must be an object.")

        action_type = _normalize_action_type(
            draft.get("action_type") or draft.get("action")
        )
        if action_type not in SUPPORTED_AI_ACTIONS:
            raise ValueError("Unsupported agent draft action.")

        payload = _coerce_dict(
            draft.get("payload") if "payload" in draft else draft.get("data"),
            field_name="payload",
        )
        payload = _normalize_payload(action_type=action_type, payload=payload)
        missing_fields = _infer_missing_fields(
            action_type=action_type,
            payload=payload,
            missing_fields=normalize_missing_field_names(draft.get("missing_fields")),
        )
        status = _normalize_status(draft.get("status"), missing_fields=missing_fields)
        required_confirmation = _normalize_confirmation(
            draft.get("required_confirmation"),
            action_type=action_type,
        )
        preview = _coerce_preview(
            draft.get("preview"),
            action_type=action_type,
            payload=payload,
        )
        preconditions = _coerce_dict(
            draft.get("preconditions"),
            field_name="preconditions",
            default={},
        )

        drafts.append(
            AgentDraftSpec(
                action_type=action_type,
                required_confirmation=required_confirmation,
                status=status,
                payload=payload,
                preview=preview,
                missing_fields=missing_fields,
                preconditions=preconditions,
            )
        )

    normalized_message = message.strip()
    if drafts and _message_claims_completed_action(normalized_message):
        normalized_message = _build_draft_pending_message(drafts)

    return AgentRunResult(message=normalized_message, drafts=drafts)


def build_agent_prompt(*, interaction) -> str:
    context = build_agent_context(
        trip=interaction.trip,
        actor=interaction.requested_by,
    )
    return json.dumps(
        {
            "instruction": (
                "You are GoPlanAI. Use the provided GoPlan trip context. "
                "Return only JSON with keys message and drafts. drafts must "
                "be an array. Use no markdown code fences. Never claim an "
                "action has been completed; action drafts only become real "
                "after the user confirms them in GoPlan. Draft specs are "
                "untrusted and will be validated by Django before storage. "
                "Every draft object must use action_type, required_confirmation, "
                "status, payload, preview, missing_fields, and preconditions. "
                "Use status READY only when required payload fields are known; "
                "otherwise use NEEDS_INFO and list missing_fields. "
                "Use required_confirmation CAPTAIN for expense, settlement, and "
                "timeline create/update/delete drafts; TIMELINE_ACTIVITY_STATUS "
                "for timeline.activity.status.update; TRANSFER_PAYER or "
                "TRANSFER_RECIPIENT for settlement transfer drafts. "
                "For timeline.activity.create, put section_id at payload.section_id "
                "and activity fields under payload.data. Create at most 3 timeline "
                "activity drafts per response and keep preview short. "
                "For stale-data protection, set preconditions.target only for "
                "drafts that update, delete, or change status of an expense or "
                "timeline_activity. Shape it as "
                "{\"type\":\"expense\",\"id\":\"...\",\"updated_at\":\"...\"} "
                "or "
                "{\"type\":\"timeline_activity\",\"id\":\"...\",\"updated_at\":\"...\"}. "
                "Leave preconditions empty for create, settlement, and transfer "
                "drafts unless transfer payer/recipient IDs are needed for "
                "confirmation permission."
            ),
            "user_prompt": interaction.prompt,
            "context": context,
            "supported_actions": sorted(SUPPORTED_AI_ACTIONS),
        },
        ensure_ascii=False,
        default=str,
    )


def run_goplan_ai_agent(interaction) -> AgentRunResult:
    prompt = build_agent_prompt(interaction=interaction)
    provider_result = complete_goplan_ai_agent_prompt(prompt)
    parsed = parse_agent_response(provider_result.content)
    return AgentRunResult(
        message=parsed.message,
        drafts=parsed.drafts,
        usage=provider_result.usage,
    )
