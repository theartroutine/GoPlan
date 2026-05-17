from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from ai.agent.runner import AgentRunResult, run_goplan_ai_agent
from ai.deepseek import DeepSeekToolResult, DeepSeekUsage, ToolCallParsed
from ai.models import (
    AIActionDraft,
    AIActionDraftStatus,
    AIInteraction,
    AIInteractionErrorCode,
    AIInteractionStatus,
)
from chat.models import ChatMessage
from expenses.models import Expense
from expenses.services import create_expense as create_expense_service
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
                        '"system_type":"SIGHTSEEING","time_mode":"FLEXIBLE"}'
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
        draft = AIActionDraft.objects.get(interaction=self.interaction)
        self.assertEqual(draft.required_confirmation, "CAPTAIN")

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
                    name="update_action_draft",
                    arguments_json='{"fields":{"title":"X"}}',
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

    @patch("ai.agent.runner.complete_with_tools")
    def test_create_expense_with_missing_amount_creates_needs_info_draft(
        self,
        mock_complete,
    ):
        mock_complete.return_value = DeepSeekToolResult(
            text=None,
            tool_calls=[
                ToolCallParsed(
                    id="c1",
                    name="create_expense",
                    arguments_json='{"title":"Lunch"}',
                ),
            ],
            usage=DeepSeekUsage(1, 1, 2),
            finish_reason="tool_calls",
        )

        result = run_goplan_ai_agent(interaction=self.interaction)

        self.assertIsNone(result.error_code)
        draft = AIActionDraft.objects.get(interaction=self.interaction)
        self.assertEqual(draft.status, AIActionDraftStatus.NEEDS_INFO)
        self.assertEqual(draft.payload, {"title": "Lunch"})
        self.assertEqual(
            draft.missing_fields,
            [{"name": "total_amount", "label": "Amount", "type": "money"}],
        )

    @patch("ai.agent.runner.complete_with_tools")
    def test_text_only_provider_response_is_recorded_as_respond_to_user_tool(
        self,
        mock_complete,
    ):
        mock_complete.return_value = DeepSeekToolResult(
            text="Bạn muốn đặt tên hoạt động này là gì?",
            tool_calls=[],
            usage=DeepSeekUsage(1, 1, 2),
            finish_reason="stop",
        )

        result = run_goplan_ai_agent(interaction=self.interaction)

        self.assertIsNone(result.error_code)
        self.assertEqual(result.message_text, "Bạn muốn đặt tên hoạt động này là gì?")
        self.interaction.refresh_from_db()
        self.assertEqual(self.interaction.tool_calls_count, 1)
        self.assertEqual(
            AIActionDraft.objects.filter(interaction=self.interaction).count(),
            0,
        )

    @patch("ai.agent.runner.complete_with_tools")
    def test_finalize_settlement_prompt_is_repaired_when_model_only_replies(
        self,
        mock_complete,
    ):
        self.interaction.prompt = "Finalize settlement cho chuyến đi hiện tại từ tất cả expenses."
        self.interaction.save(update_fields=["prompt"])
        mock_complete.return_value = DeepSeekToolResult(
            text=None,
            tool_calls=[
                ToolCallParsed(
                    id="c1",
                    name="respond_to_user",
                    arguments_json='{"message":"Bạn cần tạo settlement trước."}',
                ),
            ],
            usage=DeepSeekUsage(1, 1, 2),
            finish_reason="tool_calls",
        )

        result = run_goplan_ai_agent(interaction=self.interaction)

        self.assertIsNone(result.error_code)
        draft = AIActionDraft.objects.get(interaction=self.interaction)
        self.assertEqual(draft.action_type, "settlement.finalize")
        self.assertEqual(draft.status, AIActionDraftStatus.READY)
        self.assertEqual(draft.payload, {})

    @patch("ai.agent.runner.complete_with_tools")
    def test_existing_day_activity_prompt_synthesizes_activity_tool(
        self,
        mock_complete,
    ):
        section_2 = TimelineSection.objects.get(
            trip=self.trip,
            section_date=date(2026, 7, 2),
        )
        self.interaction.prompt = (
            "Thêm một hoạt động vào ngày 2 từ 19:00 đến 20:00."
        )
        self.interaction.save(update_fields=["prompt"])
        mock_complete.return_value = DeepSeekToolResult(
            text="Bạn muốn đặt tên hoạt động này là gì?",
            tool_calls=[],
            usage=DeepSeekUsage(1, 1, 2),
            finish_reason="stop",
        )

        result = run_goplan_ai_agent(interaction=self.interaction)

        self.assertIsNone(result.error_code)
        self.assertEqual(mock_complete.call_count, 1)
        draft = AIActionDraft.objects.get(interaction=self.interaction)
        self.assertEqual(draft.status, AIActionDraftStatus.NEEDS_INFO)
        self.assertEqual(draft.payload["section_id"], str(section_2.id))
        self.assertEqual(draft.payload["data"]["start_time"], "19:00:00")
        self.assertEqual(draft.payload["data"]["end_time"], "20:00:00")
        missing_names = {field["name"] for field in draft.missing_fields}
        self.assertIn("title", missing_names)

    @patch("ai.agent.runner.complete_with_tools")
    def test_missing_day_activity_prompt_synthesizes_activity_tool(
        self,
        mock_complete,
    ):
        self.interaction.prompt = (
            'Tạo activity "Sunset walk" ngày 4 lúc 17:00 ở biển Mỹ Khê.'
        )
        self.interaction.save(update_fields=["prompt"])
        mock_complete.return_value = DeepSeekToolResult(
            text=None,
            tool_calls=[
                ToolCallParsed(
                    id="c1",
                    name="respond_to_user",
                    arguments_json='{"message":"Chưa có section cho ngày này."}',
                ),
            ],
            usage=DeepSeekUsage(1, 1, 2),
            finish_reason="tool_calls",
        )

        result = run_goplan_ai_agent(interaction=self.interaction)

        self.assertIsNone(result.error_code)
        self.assertEqual(mock_complete.call_count, 1)
        draft = AIActionDraft.objects.get(interaction=self.interaction)
        self.assertEqual(draft.action_type, "timeline.activity.create")
        self.assertEqual(draft.payload["section_date"], "2026-07-04")
        self.assertEqual(draft.payload["data"]["title"], "Sunset walk")
        self.assertEqual(draft.payload["data"]["start_time"], "17:00:00")

    @patch("ai.agent.runner.complete_with_tools")
    def test_update_draft_precondition_uses_context_target_version(self, mock_complete):
        expense = create_expense_service(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Original dinner",
            total_amount=Decimal("600000"),
        )
        original_updated_at = expense.updated_at.isoformat()

        def complete_after_external_update(*, messages, tools):
            Expense.objects.filter(pk=expense.pk).update(
                title="Changed after context",
                updated_at=timezone.now() + timedelta(seconds=30),
            )
            return DeepSeekToolResult(
                text=None,
                tool_calls=[
                    ToolCallParsed(
                        id="c1",
                        name="update_expense",
                        arguments_json=(
                            '{"expense_id":"%s","title":"AI planned title"}'
                        )
                        % expense.id,
                    ),
                ],
                usage=DeepSeekUsage(1, 1, 2),
                finish_reason="tool_calls",
            )

        mock_complete.side_effect = complete_after_external_update

        result = run_goplan_ai_agent(interaction=self.interaction)

        self.assertIsNone(result.error_code)
        draft = AIActionDraft.objects.get(interaction=self.interaction)
        self.assertEqual(
            draft.preconditions["target"]["updated_at"],
            original_updated_at,
        )

    @patch("ai.agent.runner.complete_with_tools")
    def test_later_tool_error_rolls_back_earlier_draft(self, mock_complete):
        mock_complete.return_value = DeepSeekToolResult(
            text=None,
            tool_calls=[
                ToolCallParsed(
                    id="c1",
                    name="create_timeline_activity",
                    arguments_json=(
                        '{"section_id":"%s","title":"X",'
                        '"system_type":"SIGHTSEEING","time_mode":"FLEXIBLE"}'
                    )
                    % self.section.id,
                ),
                ToolCallParsed(id="c2", name="not_a_tool", arguments_json="{}"),
            ],
            usage=DeepSeekUsage(1, 1, 2),
            finish_reason="tool_calls",
        )

        result = run_goplan_ai_agent(interaction=self.interaction)

        self.assertEqual(result.error_code, AIInteractionErrorCode.TOOL_UNKNOWN)
        self.assertEqual(
            AIActionDraft.objects.filter(interaction=self.interaction).count(),
            0,
        )
