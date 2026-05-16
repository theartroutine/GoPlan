from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass

from pydantic import ValidationError as PydanticValidationError

from ai.agent.context import build_agent_context_bundle
from ai.agent.tools import openai_tool_params, resolve_tool
from ai.deepseek import (
    DeepSeekProviderError,
    DeepSeekToolResult,
    complete_with_tools,
)
from ai.models import AIInteractionErrorCode


@dataclass
class AgentRunResult:
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
        "`draft_id` instead of creating a new draft. Never invent IDs; use "
        "only IDs present in the provided context. Respond to the user in "
        "Vietnamese unless the user clearly uses another language. Be "
        "concise; the chat shows action cards beside your text reply."
    )


_v2_logger = logging.getLogger(__name__)


def _v2_log(event: str, *, interaction_id: str, **kwargs) -> None:
    _v2_logger.info(
        event,
        extra={"event": event, "interaction_id": interaction_id, **kwargs},
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
            return AgentRunResult(
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
            return AgentRunResult(
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
            return AgentRunResult(
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
    return AgentRunResult(
        drafts_created=drafts_created,
        message_text=message_text,
    )
