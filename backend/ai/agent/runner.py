from __future__ import annotations

import json
from dataclasses import dataclass, replace

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
from ai.agent.context import build_agent_context_bundle
from ai.agent.draft_fields import (
    build_missing_fields,
    normalize_missing_field_names,
)
from ai.agent.payload_validation import missing_payload_field_names
from ai.agent.preconditions import (
    action_requires_stale_precondition,
    build_backend_preconditions,
)
from ai.agent.preview import build_action_preview
from ai.deepseek import (
    DeepSeekProviderError,
    DeepSeekToolResult,
    complete_goplan_ai_agent_prompt,
    complete_with_tools,
)
from ai.models import AIActionDraftStatus, AIInteractionErrorCode
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

MAX_AGENT_DRAFTS = 5
MAX_TIMELINE_ACTIVITY_CREATE_DRAFTS = 3
TARGET_IDENTITY_MISSING_FIELDS = {"activity_id", "expense_id", "transfer_id"}


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


@dataclass(frozen=True)
class AgentPromptBundle:
    prompt: str
    target_versions: dict


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


def _coerce_preconditions(value) -> dict:
    # Preconditions are backend-owned. Provider output here is untrusted and is
    # replaced or cleared before storage, so malformed values should not fail
    # an otherwise valid draft.
    if isinstance(value, dict):
        return value
    return {}


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


def _has_missing_target_identity(missing_fields: list) -> bool:
    missing_names = set(normalize_missing_field_names(missing_fields, strict=False))
    return bool(missing_names & TARGET_IDENTITY_MISSING_FIELDS)


def _build_target_clarification_message() -> str:
    return (
        "Mình cần bạn nói rõ đối tượng cần thao tác trước khi tạo bản nháp "
        "(ví dụ khoản chi, hoạt động, hoặc giao dịch chuyển tiền cụ thể)."
    )


def parse_agent_response(content: str) -> AgentRunResult:
    raw = _parse_json_object(content)
    message = raw.get("message")
    drafts_raw = raw.get("drafts", [])
    if not isinstance(message, str) or not message.strip():
        raise ValueError("Agent response message must be a non-empty string.")
    if not isinstance(drafts_raw, list):
        raise ValueError("Agent response drafts must be a list.")
    if len(drafts_raw) > MAX_AGENT_DRAFTS:
        raise ValueError("Agent response includes too many drafts.")

    drafts = []
    skipped_missing_target = False
    timeline_activity_create_count = 0
    for draft in drafts_raw:
        if not isinstance(draft, dict):
            raise ValueError("Each draft must be an object.")

        action_type = _normalize_action_type(
            draft.get("action_type") or draft.get("action")
        )
        if action_type not in SUPPORTED_AI_ACTIONS:
            raise ValueError("Unsupported agent draft action.")
        if action_type == AI_ACTION_TIMELINE_ACTIVITY_CREATE:
            timeline_activity_create_count += 1
            if timeline_activity_create_count > MAX_TIMELINE_ACTIVITY_CREATE_DRAFTS:
                raise ValueError("Agent response includes too many timeline drafts.")

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
        if _has_missing_target_identity(missing_fields):
            skipped_missing_target = True
            continue
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
        preconditions = _coerce_preconditions(draft.get("preconditions"))

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
    if skipped_missing_target:
        clarification_message = _build_target_clarification_message()
        if drafts:
            normalized_message = f"{normalized_message}\n\n{clarification_message}"
        else:
            normalized_message = clarification_message

    return AgentRunResult(message=normalized_message, drafts=drafts)


def _attach_backend_preconditions(
    *,
    interaction,
    drafts: list[AgentDraftSpec],
    target_versions: dict | None = None,
) -> list[AgentDraftSpec]:
    next_drafts = []
    for draft in drafts:
        if not action_requires_stale_precondition(draft.action_type):
            next_drafts.append(replace(draft, preconditions={}))
            continue

        next_drafts.append(
            replace(
                draft,
                preconditions=build_backend_preconditions(
                    action_type=draft.action_type,
                    trip_id=interaction.trip_id,
                    payload=draft.payload,
                    required=draft.status == AIActionDraftStatus.READY,
                    target_versions=target_versions,
                ),
            )
        )
    return next_drafts


def build_agent_prompt_bundle(*, interaction) -> AgentPromptBundle:
    context_bundle = build_agent_context_bundle(
        trip=interaction.trip,
        actor=interaction.requested_by,
    )
    prompt = json.dumps(
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
                "If an action needs an existing expense, timeline activity, or "
                "transfer but the target is ambiguous, ask a clarification question "
                "in message and do not create a draft for that action. "
                "Django will build stale-data preconditions for drafts that "
                "update, delete, or change status of an expense or "
                "timeline_activity, so leave preconditions empty unless a "
                "future backend contract explicitly requires otherwise."
            ),
            "user_prompt": interaction.prompt,
            "context": context_bundle.context,
            "supported_actions": sorted(SUPPORTED_AI_ACTIONS),
        },
        ensure_ascii=False,
        default=str,
    )
    return AgentPromptBundle(
        prompt=prompt,
        target_versions=context_bundle.target_versions,
    )


def build_agent_prompt(*, interaction) -> str:
    return build_agent_prompt_bundle(interaction=interaction).prompt


def run_goplan_ai_agent(interaction) -> AgentRunResult:
    prompt_bundle = build_agent_prompt_bundle(interaction=interaction)
    provider_result = complete_goplan_ai_agent_prompt(prompt_bundle.prompt)
    try:
        parsed = parse_agent_response(provider_result.content)
    except ValueError as exc:
        raise DeepSeekProviderError(AIInteractionErrorCode.PROVIDER_BAD_RESPONSE) from exc
    drafts = _attach_backend_preconditions(
        interaction=interaction,
        drafts=parsed.drafts,
        target_versions=prompt_bundle.target_versions,
    )
    return AgentRunResult(
        message=parsed.message,
        drafts=drafts,
        usage=provider_result.usage,
    )


# ============================================================
# v2 runner — tool-calling state machine
# ============================================================

import logging
import time

from pydantic import ValidationError as PydanticValidationError

from ai.agent.tools import openai_tool_params, resolve_tool
@dataclass
class AgentRunResultV2:
    drafts_created: int = 0
    message_text: str | None = None
    error_code: str | None = None


def _v2_system_prompt() -> str:
    return (
        "You are GoPlanAI, an in-chat assistant inside a group trip planner. "
        "You can read trip context (members, timeline, expenses, settlements) "
        "and call tools to draft actions. Every turn MUST end in at least one "
        "tool call. Use `respond_to_user` for chat-only replies (no action). "
        "When the user replies with information that fills a pending draft "
        "shown in `active_drafts`, call `update_action_draft` with that "
        "`draft_id` instead of creating a new draft. Never invent IDs — use "
        "only IDs present in the provided context. Respond to the user in "
        "Vietnamese unless the user clearly uses another language. Be "
        "concise; the chat shows action cards beside your text reply."
    )


_v2_logger = logging.getLogger(__name__)


def _v2_log(event: str, *, interaction_id: str, **kwargs) -> None:
    _v2_logger.info(event, extra={"event": event, "interaction_id": interaction_id, **kwargs})


def run_goplan_ai_agent_v2(*, interaction) -> AgentRunResultV2:
    interaction_id = str(interaction.id)
    _v2_log(
        "ai.interaction.started",
        interaction_id=interaction_id,
        trip_id=str(interaction.trip_id),
        user_id=str(interaction.requested_by_id),
    )

    try:
        bundle = build_agent_context_bundle(
            trip=interaction.trip,
            actor=interaction.requested_by,
        )
        context = bundle.context
        _v2_log(
            "ai.context.built",
            interaction_id=interaction_id,
            sections=len(context.get("sections", [])),
            active_drafts=len(context.get("active_drafts", [])),
            recent_chat=len(context.get("recent_chat", [])),
        )
    except Exception as exc:
        _v2_log(
            "ai.interaction.failed",
            interaction_id=interaction_id,
            error_code=AIInteractionErrorCode.INTERNAL_ERROR,
            reason=str(exc),
        )
        return AgentRunResultV2(error_code=AIInteractionErrorCode.INTERNAL_ERROR)

    messages = [
        {"role": "system", "content": _v2_system_prompt()},
        {"role": "system", "content": "CONTEXT:\n" + json.dumps(context, default=str)},
        {"role": "user", "content": interaction.prompt},
    ]
    start = time.monotonic()
    try:
        provider_result: DeepSeekToolResult = complete_with_tools(
            messages=messages,
            tools=openai_tool_params(),
        )
    except DeepSeekProviderError as exc:
        _v2_log(
            "ai.provider.error",
            interaction_id=interaction_id,
            error_code=exc.error_code,
        )
        return AgentRunResultV2(error_code=exc.error_code)

    latency_ms = int((time.monotonic() - start) * 1000)
    _v2_log(
        "ai.provider.response",
        interaction_id=interaction_id,
        latency_ms=latency_ms,
        input_tokens=provider_result.usage.input_tokens,
        output_tokens=provider_result.usage.output_tokens,
        tool_calls=len(provider_result.tool_calls),
    )

    interaction.input_tokens = provider_result.usage.input_tokens
    interaction.output_tokens = provider_result.usage.output_tokens
    interaction.latency_ms = latency_ms
    interaction.tool_calls_count = len(provider_result.tool_calls)
    save_fields = ["input_tokens", "output_tokens", "latency_ms", "tool_calls_count"]

    drafts_created = 0
    message_text: str | None = provider_result.text

    for tc in provider_result.tool_calls:
        try:
            tool = resolve_tool(tc.name)
        except KeyError:
            _v2_log(
                "ai.tool_call.rejected",
                interaction_id=interaction_id,
                tool_name=tc.name,
                error_code=AIInteractionErrorCode.TOOL_UNKNOWN,
            )
            interaction.save(update_fields=save_fields)
            return AgentRunResultV2(
                error_code=AIInteractionErrorCode.TOOL_UNKNOWN,
                drafts_created=drafts_created,
            )

        try:
            args = tool.schema.model_validate_json(tc.arguments_json)
        except PydanticValidationError as exc:
            _v2_log(
                "ai.tool_call.rejected",
                interaction_id=interaction_id,
                tool_name=tc.name,
                error_code=AIInteractionErrorCode.TOOL_VALIDATION_FAILED,
                errors=exc.errors(include_url=False),
            )
            interaction.save(update_fields=save_fields)
            return AgentRunResultV2(
                error_code=AIInteractionErrorCode.TOOL_VALIDATION_FAILED,
                drafts_created=drafts_created,
            )

        try:
            handler_result = tool.handler(
                trip=interaction.trip,
                interaction=interaction,
                actor=interaction.requested_by,
                args=args,
            )
        except Exception as exc:
            _v2_log(
                "ai.tool_call.failed",
                interaction_id=interaction_id,
                tool_name=tc.name,
                reason=str(exc),
            )
            interaction.save(update_fields=save_fields)
            return AgentRunResultV2(
                error_code=AIInteractionErrorCode.INTERNAL_ERROR,
                drafts_created=drafts_created,
            )

        if handler_result.draft is not None:
            drafts_created += 1
            _v2_log(
                "ai.tool_call.applied",
                interaction_id=interaction_id,
                tool_name=tc.name,
                draft_id=str(handler_result.draft.id),
            )
        if handler_result.message is not None:
            message_text = handler_result.message

    interaction.save(update_fields=save_fields)
    _v2_log(
        "ai.interaction.completed",
        interaction_id=interaction_id,
        drafts_created=drafts_created,
    )
    return AgentRunResultV2(
        drafts_created=drafts_created,
        message_text=message_text,
    )
