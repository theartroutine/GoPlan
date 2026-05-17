from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings
from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI

from ai.models import AIInteractionErrorCode


@dataclass(frozen=True)
class DeepSeekUsage:
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None


class DeepSeekProviderError(Exception):
    def __init__(self, error_code: str):
        super().__init__(error_code)
        self.error_code = error_code


def _map_status_error(exc: APIStatusError) -> str:
    if exc.status_code == 429:
        return AIInteractionErrorCode.RATE_LIMIT
    if exc.status_code == 402:
        return AIInteractionErrorCode.INSUFFICIENT_BALANCE
    if exc.status_code >= 500:
        return AIInteractionErrorCode.PROVIDER_UNAVAILABLE
    return AIInteractionErrorCode.PROVIDER_BAD_RESPONSE


@dataclass(frozen=True)
class ToolCallParsed:
    id: str
    name: str
    arguments_json: str


@dataclass(frozen=True)
class DeepSeekToolResult:
    text: str | None
    tool_calls: list[ToolCallParsed]
    usage: DeepSeekUsage
    finish_reason: str | None


def complete_with_tools(
    *,
    messages: list[dict],
    tools: list[dict],
    tool_choice: str | dict = "auto",
) -> DeepSeekToolResult:
    if not settings.DEEPSEEK_API_KEY:
        raise DeepSeekProviderError(AIInteractionErrorCode.CONFIG_MISSING)
    client = OpenAI(
        api_key=settings.DEEPSEEK_API_KEY,
        base_url=settings.DEEPSEEK_BASE_URL,
        timeout=settings.DEEPSEEK_TIMEOUT_SECONDS,
    )
    try:
        response = client.chat.completions.create(
            model=settings.DEEPSEEK_MODEL,
            messages=messages,
            tools=tools,
            tool_choice=tool_choice,
            stream=False,
            max_tokens=settings.DEEPSEEK_MAX_OUTPUT_TOKENS,
        )
    except APITimeoutError as exc:
        raise DeepSeekProviderError(AIInteractionErrorCode.TIMEOUT) from exc
    except APIStatusError as exc:
        raise DeepSeekProviderError(_map_status_error(exc)) from exc
    except APIConnectionError as exc:
        raise DeepSeekProviderError(AIInteractionErrorCode.PROVIDER_UNAVAILABLE) from exc

    choice = response.choices[0] if response.choices else None
    if choice is None:
        raise DeepSeekProviderError(AIInteractionErrorCode.PROVIDER_BAD_RESPONSE)
    msg = choice.message
    tool_calls = []
    for tc in msg.tool_calls or []:
        tool_calls.append(
            ToolCallParsed(
                id=tc.id,
                name=tc.function.name,
                arguments_json=tc.function.arguments,
            )
        )
    usage = getattr(response, "usage", None)
    return DeepSeekToolResult(
        text=(msg.content or None),
        tool_calls=tool_calls,
        usage=DeepSeekUsage(
            input_tokens=getattr(usage, "prompt_tokens", None),
            output_tokens=getattr(usage, "completion_tokens", None),
            total_tokens=getattr(usage, "total_tokens", None),
        ),
        finish_reason=choice.finish_reason,
    )
