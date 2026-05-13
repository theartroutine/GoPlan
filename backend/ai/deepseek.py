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


@dataclass(frozen=True)
class DeepSeekResult:
    content: str
    usage: DeepSeekUsage


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


def complete_goplan_ai_prompt(prompt: str) -> DeepSeekResult:
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
            messages=[
                {"role": "system", "content": settings.GOPLAN_AI_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            stream=False,
            max_tokens=settings.DEEPSEEK_MAX_OUTPUT_TOKENS,
            extra_body={"thinking": {"type": "disabled"}},
        )
    except APITimeoutError as exc:
        raise DeepSeekProviderError(AIInteractionErrorCode.TIMEOUT) from exc
    except APIStatusError as exc:
        raise DeepSeekProviderError(_map_status_error(exc)) from exc
    except APIConnectionError as exc:
        raise DeepSeekProviderError(
            AIInteractionErrorCode.PROVIDER_UNAVAILABLE
        ) from exc

    choice = response.choices[0] if response.choices else None
    finish_reason = getattr(choice, "finish_reason", None)
    if finish_reason in {"content_filter", "insufficient_system_resource"}:
        raise DeepSeekProviderError(AIInteractionErrorCode.PROVIDER_BAD_RESPONSE)

    content = choice.message.content if choice else ""
    if not isinstance(content, str) or not content.strip():
        raise DeepSeekProviderError(AIInteractionErrorCode.PROVIDER_BAD_RESPONSE)

    usage = getattr(response, "usage", None)
    return DeepSeekResult(
        content=content.strip(),
        usage=DeepSeekUsage(
            input_tokens=getattr(usage, "prompt_tokens", None),
            output_tokens=getattr(usage, "completion_tokens", None),
            total_tokens=getattr(usage, "total_tokens", None),
        ),
    )
