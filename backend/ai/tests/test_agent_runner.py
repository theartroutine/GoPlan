from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from ai.agent.runner import AgentRunResult, run_goplan_ai_agent
from ai.deepseek import DeepSeekToolResult, DeepSeekUsage, ToolCallParsed
from ai.models import AIInteraction, AIInteractionErrorCode, AIInteractionStatus
from chat.models import ChatMessage
from test_helpers import create_completed_user
from trips.models import TimelineSection
from trips.services import create_trip


class RunnerTests(TestCase):
    def setUp(self):
        self.captain = create_completed_user(
            "runner-cap@example.com", "runnercap", "RUN001"
        )
        self.trip = create_trip(
            captain=self.captain,
            name="Runner Trip",
            destination="Hoi An",
            start_date=date(2026, 7, 1),
            end_date=date(2026, 7, 3),
        )
        self.section = TimelineSection.objects.filter(trip=self.trip).first()
        prompt_message = ChatMessage.objects.create(
            trip=self.trip,
            sender=self.captain,
            sender_display_name_snapshot=self.captain.display_name,
            sender_identify_tag_snapshot=self.captain.identify_tag,
            content="@GoPlanAI add sightseeing",
            client_message_id=uuid4(),
        )
        self.interaction = AIInteraction.objects.create(
            trip=self.trip,
            requested_by=self.captain,
            prompt_message=prompt_message,
            prompt="add sightseeing",
            status=AIInteractionStatus.RUNNING,
            lock_expires_at=timezone.now() + timedelta(minutes=2),
        )

    @patch("ai.agent.runner.complete_with_tools")
    def test_happy_path_creates_draft_and_responds(self, mock_complete):
        mock_complete.return_value = DeepSeekToolResult(
            text=None,
            tool_calls=[
                ToolCallParsed(
                    id="c1",
                    name="create_timeline_activity",
                    arguments_json=(
                        '{"section_id":"%s","title":"X",'
                        '"system_type":"SIGHTSEEING","time_mode":"ANCHOR"}'
                    )
                    % self.section.id,
                ),
                ToolCallParsed(
                    id="c2",
                    name="respond_to_user",
                    arguments_json='{"message":"Created."}',
                ),
            ],
            usage=DeepSeekUsage(10, 5, 15),
            finish_reason="tool_calls",
        )

        result = run_goplan_ai_agent(interaction=self.interaction)

        self.assertIsInstance(result, AgentRunResult)
        self.assertEqual(result.drafts_created, 1)
        self.assertEqual(result.message_text, "Created.")
        self.interaction.refresh_from_db()
        self.assertEqual(self.interaction.input_tokens, 10)
        self.assertEqual(self.interaction.tool_calls_count, 2)

    @patch("ai.agent.runner.complete_with_tools")
    def test_unknown_tool_returns_tool_unknown_error(self, mock_complete):
        mock_complete.return_value = DeepSeekToolResult(
            text=None,
            tool_calls=[
                ToolCallParsed(id="c1", name="not_a_tool", arguments_json="{}")
            ],
            usage=DeepSeekUsage(1, 1, 2),
            finish_reason="tool_calls",
        )

        result = run_goplan_ai_agent(interaction=self.interaction)

        self.assertEqual(result.error_code, AIInteractionErrorCode.TOOL_UNKNOWN)

    @patch("ai.agent.runner.complete_with_tools")
    def test_invalid_tool_args_returns_validation_failed(self, mock_complete):
        mock_complete.return_value = DeepSeekToolResult(
            text=None,
            tool_calls=[
                ToolCallParsed(
                    id="c1",
                    name="create_expense",
                    arguments_json='{"title":"X","total_amount":"100","currency_code":"VND"}',
                ),
            ],
            usage=DeepSeekUsage(1, 1, 2),
            finish_reason="tool_calls",
        )

        result = run_goplan_ai_agent(interaction=self.interaction)

        self.assertEqual(
            result.error_code,
            AIInteractionErrorCode.TOOL_VALIDATION_FAILED,
        )
