from __future__ import annotations

from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from ai.deepseek import complete_with_tools


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
        mock_response.choices = [
            type(
                "C",
                (),
                {
                    "message": type(
                        "M",
                        (),
                        {
                            "content": None,
                            "tool_calls": [
                                type(
                                    "T",
                                    (),
                                    {
                                        "id": "call_1",
                                        "function": type(
                                            "F",
                                            (),
                                            {
                                                "name": "respond_to_user",
                                                "arguments": '{"message":"hi"}',
                                            },
                                        )(),
                                    },
                                )()
                            ],
                        },
                    )(),
                    "finish_reason": "tool_calls",
                },
            )()
        ]
        mock_response.usage = type(
            "U",
            (),
            {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        )()

        result = complete_with_tools(
            messages=[{"role": "user", "content": "say hi"}],
            tools=[
                {
                    "type": "function",
                    "function": {
                        "name": "respond_to_user",
                        "parameters": {},
                    },
                }
            ],
        )

        self.assertEqual(len(result.tool_calls), 1)
        self.assertEqual(result.tool_calls[0].name, "respond_to_user")
        self.assertEqual(result.tool_calls[0].arguments_json, '{"message":"hi"}')
        self.assertEqual(result.usage.input_tokens, 10)
        self.assertEqual(result.usage.output_tokens, 5)
        self.assertEqual(result.finish_reason, "tool_calls")
