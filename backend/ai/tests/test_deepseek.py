from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from ai.deepseek import DeepSeekProviderError, complete_goplan_ai_prompt, complete_with_tools
from ai.models import AIInteractionErrorCode


class DeepSeekClientTests(SimpleTestCase):
    @override_settings(
        DEEPSEEK_API_KEY="test-key",
        DEEPSEEK_BASE_URL="https://api.deepseek.com",
        DEEPSEEK_MODEL="deepseek-v4-flash",
        DEEPSEEK_TIMEOUT_SECONDS=60,
        DEEPSEEK_MAX_OUTPUT_TOKENS=800,
        GOPLAN_AI_THINKING_ENABLED=True,
        GOPLAN_AI_REASONING_EFFORT="high",
        GOPLAN_AI_SYSTEM_PROMPT="system prompt",
    )
    @patch("ai.deepseek.OpenAI")
    def test_complete_prompt_uses_deepseek_contract(self, mock_openai):
        response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason="stop",
                    message=SimpleNamespace(content=" AI answer "),
                )
            ],
            usage=SimpleNamespace(
                prompt_tokens=3,
                completion_tokens=4,
                total_tokens=7,
            ),
        )
        client = mock_openai.return_value
        client.chat.completions.create.return_value = response

        result = complete_goplan_ai_prompt("plan day 1")

        mock_openai.assert_called_once_with(
            api_key="test-key",
            base_url="https://api.deepseek.com",
            timeout=60,
        )
        client.chat.completions.create.assert_called_once_with(
            model="deepseek-v4-flash",
            messages=[
                {"role": "system", "content": "system prompt"},
                {"role": "user", "content": "plan day 1"},
            ],
            stream=False,
            max_tokens=800,
            reasoning_effort="high",
            extra_body={"thinking": {"type": "enabled"}},
        )
        self.assertEqual(result.content, "AI answer")
        self.assertEqual(result.usage.total_tokens, 7)

    @override_settings(
        DEEPSEEK_API_KEY="test-key",
        DEEPSEEK_BASE_URL="https://api.deepseek.com",
        DEEPSEEK_MODEL="deepseek-v4-flash",
        DEEPSEEK_TIMEOUT_SECONDS=60,
        DEEPSEEK_MAX_OUTPUT_TOKENS=800,
        GOPLAN_AI_THINKING_ENABLED=False,
        GOPLAN_AI_REASONING_EFFORT="high",
        GOPLAN_AI_SYSTEM_PROMPT="system prompt",
    )
    @patch("ai.deepseek.OpenAI")
    def test_complete_prompt_can_disable_thinking(self, mock_openai):
        response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason="stop",
                    message=SimpleNamespace(content=" AI answer "),
                )
            ],
            usage=SimpleNamespace(
                prompt_tokens=3,
                completion_tokens=4,
                total_tokens=7,
            ),
        )
        client = mock_openai.return_value
        client.chat.completions.create.return_value = response

        complete_goplan_ai_prompt("plan day 1")

        client.chat.completions.create.assert_called_once_with(
            model="deepseek-v4-flash",
            messages=[
                {"role": "system", "content": "system prompt"},
                {"role": "user", "content": "plan day 1"},
            ],
            stream=False,
            max_tokens=800,
            extra_body={"thinking": {"type": "disabled"}},
        )

    @override_settings(DEEPSEEK_API_KEY="")
    def test_missing_api_key_maps_to_config_missing(self):
        with self.assertRaises(DeepSeekProviderError) as ctx:
            complete_goplan_ai_prompt("hello")

        self.assertEqual(ctx.exception.error_code, AIInteractionErrorCode.CONFIG_MISSING)


@override_settings(
    DEEPSEEK_API_KEY="test-key",
    DEEPSEEK_BASE_URL="https://api.deepseek.com",
    DEEPSEEK_MODEL="deepseek-v4-flash",
    DEEPSEEK_TIMEOUT_SECONDS=60,
    DEEPSEEK_MAX_OUTPUT_TOKENS=800,
)
class ToolCallingTests(SimpleTestCase):
    @patch("ai.deepseek.OpenAI")
    def test_complete_with_tools_returns_parsed_tool_calls(self, openai_cls):
        mock_client = openai_cls.return_value
        mock_response = mock_client.chat.completions.create.return_value
        mock_response.choices = [type("C", (), {
            "message": type("M", (), {
                "content": None,
                "tool_calls": [
                    type("T", (), {
                        "id": "call_1",
                        "function": type("F", (), {
                            "name": "respond_to_user",
                            "arguments": '{"message":"hi"}',
                        })(),
                    })()
                ],
            })(),
            "finish_reason": "tool_calls",
        })()]
        mock_response.usage = type("U", (), {
            "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15
        })()

        result = complete_with_tools(
            messages=[{"role": "user", "content": "say hi"}],
            tools=[{"type": "function", "function": {"name": "respond_to_user", "parameters": {}}}],
        )
        self.assertEqual(len(result.tool_calls), 1)
        self.assertEqual(result.tool_calls[0].name, "respond_to_user")
        self.assertEqual(result.tool_calls[0].arguments_json, '{"message":"hi"}')
        self.assertEqual(result.usage.input_tokens, 10)
        self.assertEqual(result.usage.output_tokens, 5)
        self.assertEqual(result.finish_reason, "tool_calls")
