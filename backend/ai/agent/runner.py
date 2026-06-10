from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import dataclass

from django.db import transaction
from pydantic import ValidationError as PydanticValidationError

from ai.agent.context import build_agent_context_bundle
from ai.agent.intent import (
    expense_create_repair_arguments,
    prompt_requests_settlement_finalization,
    prompt_requests_timeline_activity_creation,
    timeline_activity_repair_arguments,
)
from ai.agent.text import decode_unicode_escapes
from ai.agent.tools import openai_tool_params, resolve_tool
from ai.deepseek import (
    DeepSeekProviderError,
    DeepSeekToolResult,
    ToolCallParsed,
    complete_with_tools,
)
from ai.models import AIInteractionErrorCode


@dataclass
class AgentRunResult:
    drafts_created: int = 0
    message_text: str | None = None
    error_code: str | None = None


class _AgentToolRunError(Exception):
    def __init__(self, error_code: str):
        super().__init__(error_code)
        self.error_code = error_code


ACTION_TOOL_NAMES = {
    "create_timeline_activity",
    "update_timeline_activity",
    "delete_timeline_activity",
    "update_timeline_activity_status",
    "create_expense",
    "update_expense",
    "delete_expense",
    "set_expense_contribution",
    "finalize_settlement",
    "reopen_settlement",
    "mark_transfer_sent",
    "confirm_transfer_received",
    "update_action_draft",
}


def _v2_system_prompt() -> str:
    return (
        "You are GoPlanAI, an in-chat assistant inside a group trip planner. "
        "You can read trip context (members, timeline, expenses, settlements) "
        "and call tools to draft actions. Every turn MUST end in at least one "
        "tool call. Use `respond_to_user` for chat-only replies (no action). "
        "When the user replies with information that fills a pending draft "
        "shown in `active_drafts`, call `update_action_draft` with that "
        "`draft_id` instead of creating a new draft. Never invent IDs; use "
        "only IDs present in the provided context. Respond to the user in "
        "Vietnamese unless the user clearly uses another language. When the "
        "user says every participant has paid enough for an expense, call "
        "`set_expense_contribution` with `scope: \"all_participants_paid\"` "
        "so the backend copies the exact current participant shares. If the "
        "user asks to add an activity to a trip day/date that is not present "
        "in `sections`, call `create_timeline_activity` with `section_date` "
        "computed from `trip.start_date` (day 1 is the start date); the backend "
        "will create the timeline day when the draft is confirmed. To create "
        "or finalize a settlement from current expenses, call "
        "`finalize_settlement` without a settlement_id.\n\n"
        "WRITING STYLE (how your text reply must read):\n"
        "- The chat already shows rich action cards beside your text, with "
        "every draft's details, friendly field labels, and confirm/cancel "
        "buttons. Do NOT repeat details that are already on the cards.\n"
        "- Your text reply is a short, friendly, conversational message. "
        "Keep it to 1-3 short sentences, or a brief bullet list when listing "
        "several items. Never use markdown tables.\n"
        "- NEVER show the user any internal identifier (`draft_id`/UUIDs) or "
        "raw field name (`start_time`, `end_time`, `time_range`, "
        "`system_type`, etc.). Use `draft_id` only inside tool calls "
        "(`update_action_draft`), never in your text.\n"
        "- Refer to a draft by a human description (its activity/expense "
        "name), not by its id. Describe missing info in natural language "
        "based on `missing_field_labels` (e.g. say \"cần thời gian bắt "
        "đầu\", not \"thiếu start_time\").\n"
        "- When asked what you can do, give a brief, friendly overview in a "
        "few sentences. Do not dump exhaustive bullet lists of every "
        "capability."
    )


_v2_logger = logging.getLogger(__name__)


def _v2_log(event: str, *, interaction_id: str, **kwargs) -> None:
    _v2_logger.info(
        event,
        extra={"event": event, "interaction_id": interaction_id, **kwargs},
    )


def _has_action_tool_call(result: DeepSeekToolResult) -> bool:
    return any(
        tool_call.name in ACTION_TOOL_NAMES
        for tool_call in result.tool_calls
    )


def _synthesized_tool_call(name: str, arguments: dict) -> ToolCallParsed:
    return ToolCallParsed(
        id=f"local_{uuid.uuid4().hex}",
        name=name,
        arguments_json=json.dumps(arguments),
    )


def _with_usage_from(
    result: DeepSeekToolResult,
    *,
    text: str | None,
    tool_calls: list[ToolCallParsed],
) -> DeepSeekToolResult:
    return DeepSeekToolResult(
        text=text,
        tool_calls=tool_calls,
        usage=result.usage,
        finish_reason="tool_calls",
    )


def _maybe_repair_provider_result(
    *,
    interaction,
    context: dict,
    provider_result: DeepSeekToolResult,
) -> DeepSeekToolResult:
    if _has_action_tool_call(provider_result):
        return provider_result

    prompt = interaction.prompt
    if prompt_requests_timeline_activity_creation(prompt):
        repair_arguments = timeline_activity_repair_arguments(
            prompt=prompt,
            context=context,
        )
        if repair_arguments is not None:
            return _with_usage_from(
                provider_result,
                text=provider_result.text,
                tool_calls=[
                    _synthesized_tool_call(
                        "create_timeline_activity",
                        repair_arguments,
                    ),
                ],
            )

    repair_arguments = expense_create_repair_arguments(
        prompt=prompt,
        context=context,
    )
    if repair_arguments is not None:
        return _with_usage_from(
            provider_result,
            text=provider_result.text,
            tool_calls=[
                _synthesized_tool_call(
                    "create_expense",
                    repair_arguments,
                ),
            ],
        )

    if provider_result.tool_calls:
        return provider_result

    if prompt_requests_settlement_finalization(prompt):
        return _with_usage_from(
            provider_result,
            text="Mình đã chuẩn bị draft quyết toán để bạn xác nhận.",
            tool_calls=[_synthesized_tool_call("finalize_settlement", {})],
        )

    return provider_result


def _ensure_tool_call_result(result: DeepSeekToolResult) -> DeepSeekToolResult:
    if result.tool_calls:
        return result
    message = (
        result.text
        or "Mình chưa xử lý được yêu cầu này. Bạn nói cụ thể hơn được không?"
    )
    return _with_usage_from(
        result,
        text=result.text,
        tool_calls=[_synthesized_tool_call("respond_to_user", {"message": message})],
    )


def run_goplan_ai_agent(*, interaction) -> AgentRunResult:
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
        target_versions = bundle.target_versions
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
        return AgentRunResult(error_code=AIInteractionErrorCode.INTERNAL_ERROR)

    messages = [
        {"role": "system", "content": _v2_system_prompt()},
        {
            "role": "system",
            "content": "CONTEXT:\n"
            + json.dumps(context, ensure_ascii=False, default=str),
        },
        {"role": "user", "content": interaction.prompt},
    ]
    tools = openai_tool_params()
    start = time.monotonic()
    try:
        provider_result: DeepSeekToolResult = complete_with_tools(
            messages=messages,
            tools=tools,
        )
        provider_result = _maybe_repair_provider_result(
            interaction=interaction,
            context=context,
            provider_result=provider_result,
        )
        provider_result = _ensure_tool_call_result(provider_result)
    except DeepSeekProviderError as exc:
        _v2_log(
            "ai.provider.error",
            interaction_id=interaction_id,
            error_code=exc.error_code,
        )
        return AgentRunResult(error_code=exc.error_code)

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
    interaction.total_tokens = provider_result.usage.total_tokens
    interaction.latency_ms = latency_ms
    interaction.tool_calls_count = len(provider_result.tool_calls)
    save_fields = [
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "latency_ms",
        "tool_calls_count",
    ]

    drafts_created = 0
    message_text: str | None = provider_result.text

    try:
        with transaction.atomic():
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
                    raise _AgentToolRunError(AIInteractionErrorCode.TOOL_UNKNOWN)

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
                    raise _AgentToolRunError(
                        AIInteractionErrorCode.TOOL_VALIDATION_FAILED
                    )

                try:
                    handler_result = tool.handler(
                        trip=interaction.trip,
                        interaction=interaction,
                        actor=interaction.requested_by,
                        args=args,
                        target_versions=target_versions,
                    )
                except Exception as exc:
                    _v2_log(
                        "ai.tool_call.failed",
                        interaction_id=interaction_id,
                        tool_name=tc.name,
                        reason=str(exc),
                    )
                    raise _AgentToolRunError(AIInteractionErrorCode.INTERNAL_ERROR)

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
    except _AgentToolRunError as exc:
        interaction.save(update_fields=save_fields)
        return AgentRunResult(error_code=exc.error_code)

    interaction.save(update_fields=save_fields)
    _v2_log(
        "ai.interaction.completed",
        interaction_id=interaction_id,
        drafts_created=drafts_created,
    )
    if message_text is not None:
        message_text = decode_unicode_escapes(message_text)
    return AgentRunResult(
        drafts_created=drafts_created,
        message_text=message_text,
    )
