from __future__ import annotations

import json
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from ai.agent.runner import parse_agent_response, run_goplan_ai_agent, run_goplan_ai_agent_v2
from ai.deepseek import (
    DeepSeekProviderError,
    DeepSeekResult,
    DeepSeekToolResult,
    DeepSeekUsage,
    ToolCallParsed,
)
from ai.models import AIInteraction, AIInteractionErrorCode, AIInteractionStatus
from chat.models import ChatMessage
from expenses.models import Expense
from expenses.services import create_expense
from test_helpers import create_completed_user
from trips.models import TimelineSection
from trips.services import create_trip


class AgentResponseParsingTests(TestCase):
    def test_parse_text_only_agent_response(self):
        parsed = parse_agent_response('{"message":"Trip summary","drafts":[]}')

        self.assertEqual(parsed.message, "Trip summary")
        self.assertEqual(parsed.drafts, [])

    def test_parse_rejects_non_json(self):
        with self.assertRaises(ValueError):
            parse_agent_response("plain text")

    def test_parse_requires_message_string(self):
        with self.assertRaises(ValueError):
            parse_agent_response('{"message":123,"drafts":[]}')

    def test_parse_rewrites_completion_claim_when_response_has_drafts(self):
        parsed = parse_agent_response(
            '{"message":"Tạo khoản chi Dinner thành công.",'
            '"drafts":[{"action":"expense.create",'
            '"data":{"title":"Dinner","total_amount":"1200000"}}]}'
        )

        self.assertIn("bản nháp", parsed.message)
        self.assertNotIn("thành công", parsed.message.lower())


class AgentDraftValidationTests(TestCase):
    def test_rejects_unsupported_action_type(self):
        with self.assertRaises(ValueError):
            parse_agent_response(
                '{"message":"Draft","drafts":[{"action_type":"trip.delete",'
                '"required_confirmation":"CAPTAIN","status":"READY",'
                '"payload":{},"preview":{},"missing_fields":[],'
                '"preconditions":{}}]}'
            )

    def test_accepts_supported_expense_create_draft(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"expense.create",'
            '"required_confirmation":"CAPTAIN","status":"READY",'
            '"payload":{"title":"Dinner","total_amount":"1200000"},'
            '"preview":{"title":"Dinner"},"missing_fields":[],'
            '"preconditions":{}}]}'
        )

        self.assertEqual(parsed.drafts[0].action_type, "expense.create")

    def test_accepts_provider_action_data_shape_for_expense_create(self):
        parsed = parse_agent_response(
            '{"message":"I prepared an expense draft.","drafts":[{'
            '"action":"expense.create",'
            '"data":{"title":"Dinner","total_amount":"1200000"},'
            '"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.action_type, "expense.create")
        self.assertEqual(draft.required_confirmation, "CAPTAIN")
        self.assertEqual(draft.status, "READY")
        self.assertEqual(draft.payload["title"], "Dinner")
        self.assertEqual(draft.preview["title"], "Dinner")
        self.assertEqual(draft.missing_fields, [])

    def test_expense_create_defaults_safe_optional_provider_missing_fields(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"expense.create",'
            '"required_confirmation":"CAPTAIN","status":"NEEDS_INFO",'
            '"payload":{"title":"Bus","total_amount":"2000000"},'
            '"preview":"Bus - 2.000.000 VND",'
            '"missing_fields":["collector","description","participants_shares"],'
            '"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.status, "READY")
        self.assertEqual(draft.missing_fields, [])
        self.assertEqual(draft.preview["title"], "Bus")

    def test_provider_preview_cannot_override_payload_derived_fields(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"expense.create",'
            '"required_confirmation":"CAPTAIN","status":"READY",'
            '"payload":{"title":"Dinner","total_amount":"1000000"},'
            '"preview":{"title":"Lunch","total_amount":"100000"},'
            '"missing_fields":[],"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.preview["title"], "Dinner")
        self.assertEqual(draft.preview["total_amount"], "1000000")

    def test_preview_includes_executable_optional_fields(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"expense.create",'
            '"required_confirmation":"CAPTAIN","status":"READY",'
            '"payload":{"title":"Dinner","total_amount":"1000000",'
            '"collector_id":"collector-1"},'
            '"preview":{"title":"Dinner"},"missing_fields":[],'
            '"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.preview["collector_id"], "collector-1")

    def test_provider_preconditions_are_ignored_when_malformed(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"expense.create",'
            '"required_confirmation":"CAPTAIN","status":"READY",'
            '"payload":{"title":"Lunch","total_amount":"2000000"},'
            '"preview":{"title":"Lunch"},"missing_fields":[],'
            '"preconditions":[]}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.action_type, "expense.create")
        self.assertEqual(draft.preconditions, {})

    def test_missing_fields_are_frontend_field_objects(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"expense.create",'
            '"required_confirmation":"CAPTAIN","status":"READY",'
            '"payload":{"title":"Lunch"},'
            '"preview":{"title":"Lunch"},"missing_fields":[],'
            '"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.status, "NEEDS_INFO")
        self.assertEqual(
            draft.missing_fields,
            [{"name": "total_amount", "label": "Amount", "type": "money"}],
        )

    def test_invalid_money_field_keeps_draft_needing_info(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"expense.create",'
            '"required_confirmation":"CAPTAIN","status":"READY",'
            '"payload":{"title":"Lunch","total_amount":"abc"},'
            '"preview":{"title":"Lunch"},"missing_fields":[],'
            '"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.status, "NEEDS_INFO")
        self.assertEqual(
            draft.missing_fields,
            [{"name": "total_amount", "label": "Amount", "type": "money"}],
        )

    def test_empty_container_money_field_keeps_draft_needing_info(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"expense.create",'
            '"required_confirmation":"CAPTAIN","status":"READY",'
            '"payload":{"title":"Lunch","total_amount":[]},'
            '"preview":{"title":"Lunch"},"missing_fields":[],'
            '"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.status, "NEEDS_INFO")
        self.assertEqual(
            draft.missing_fields,
            [{"name": "total_amount", "label": "Amount", "type": "money"}],
        )

    def test_action_specific_missing_fields_prevent_invalid_ready_drafts(self):
        cases = (
            (
                "timeline.activity.status.update",
                {"activity_id": "activity-1"},
                [{"name": "status", "label": "Status", "type": "select"}],
            ),
        )

        for action_type, payload, expected_missing in cases:
            with self.subTest(action_type=action_type):
                parsed = parse_agent_response(
                    '{"message":"Draft","drafts":[{'
                    f'"action_type":"{action_type}",'
                    '"required_confirmation":"CAPTAIN","status":"READY",'
                    f'"payload":{json.dumps(payload)},'
                    '"preview":{},"missing_fields":[],"preconditions":{}}]}'
                )

                draft = parsed.drafts[0]
                self.assertEqual(draft.status, "NEEDS_INFO")
                self.assertEqual(draft.missing_fields, expected_missing)

    def test_timeline_create_requires_activity_type_before_ready(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"timeline.activity.create",'
            '"required_confirmation":"CAPTAIN","status":"READY",'
            '"payload":{"section_id":"section-1","data":{'
            '"title":"Museum","time_mode":"FLEXIBLE"}},'
            '"preview":{},"missing_fields":[],"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.status, "NEEDS_INFO")
        self.assertEqual(
            draft.missing_fields,
            [{"name": "system_type", "label": "Activity type", "type": "select"}],
        )

    def test_timeline_create_requires_known_activity_type_before_ready(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"timeline.activity.create",'
            '"required_confirmation":"CAPTAIN","status":"READY",'
            '"payload":{"section_id":"section-1","data":{'
            '"title":"Museum","time_mode":"FLEXIBLE","system_type":"NOT_REAL"}},'
            '"preview":{},"missing_fields":[],"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.status, "NEEDS_INFO")
        self.assertEqual(
            draft.missing_fields,
            [{"name": "system_type", "label": "Activity type", "type": "select"}],
        )

    def test_timeline_update_requires_at_least_one_known_patch_field(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"timeline.activity.update",'
            '"required_confirmation":"CAPTAIN","status":"READY",'
            '"payload":{"activity_id":"activity-1","data":{"foo":"bar"}},'
            '"preview":{},"missing_fields":[],"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.status, "NEEDS_INFO")
        self.assertEqual(
            draft.missing_fields,
            [{"name": "data", "label": "Activity details", "type": "json"}],
        )

    def test_expense_update_requires_at_least_one_change_before_ready(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"expense.update",'
            '"required_confirmation":"CAPTAIN","status":"READY",'
            '"payload":{"expense_id":"expense-1"},'
            '"preview":{},"missing_fields":[],"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.status, "NEEDS_INFO")
        self.assertEqual(
            draft.missing_fields,
            [{"name": "title", "label": "Title"}],
        )

    def test_nested_contribution_draft_requires_complete_contribution_items(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"expense.contribution.set",'
            '"required_confirmation":"CAPTAIN","status":"READY",'
            '"payload":{"expense_id":"expense-1",'
            '"contributions":[{"user_id":"user-1"}]},'
            '"preview":{},"missing_fields":[],"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.status, "NEEDS_INFO")
        self.assertEqual(
            draft.missing_fields,
            [
                {
                    "name": "contributions",
                    "label": "Contributions",
                    "type": "json",
                }
            ],
        )

    def test_missing_target_identity_returns_clarification_without_draft(self):
        cases = (
            ("expense.update", {"title": "Dinner"}),
            ("timeline.activity.update", {"data": {"title": "Museum"}}),
            ("settlement.transfer.mark_sent", {}),
        )

        for action_type, payload in cases:
            with self.subTest(action_type=action_type):
                parsed = parse_agent_response(
                    '{"message":"I prepared a draft.","drafts":[{'
                    f'"action_type":"{action_type}",'
                    '"required_confirmation":"CAPTAIN","status":"READY",'
                    f'"payload":{json.dumps(payload)},'
                    '"preview":{},"missing_fields":[],"preconditions":{}}]}'
                )

                self.assertEqual(parsed.drafts, [])
                self.assertIn("đối tượng", parsed.message)

    def test_timeline_status_update_requires_known_status_before_ready(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{'
            '"action_type":"timeline.activity.status.update",'
            '"payload":{"activity_id":"activity-1","status":"NOT_REAL"},'
            '"preview":{},"missing_fields":[],"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.status, "NEEDS_INFO")
        self.assertEqual(
            draft.missing_fields,
            [{"name": "status", "label": "Status", "type": "select"}],
        )

    def test_timeline_status_update_defaults_to_status_service_confirmation(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{'
            '"action_type":"timeline.activity.status.update",'
            '"payload":{"activity_id":"activity-1","status":"IN_PROGRESS"},'
            '"preview":{},"missing_fields":[],"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.required_confirmation, "TIMELINE_ACTIVITY_STATUS")

    def test_timeline_create_normalizes_flat_provider_payload(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"timeline.activity.create",'
            '"required_confirmation":"CAPTAIN","status":"NEEDS_INFO",'
            '"payload":{"section_id":"section-1","title":"Bãi Sau",'
            '"time_mode":"TIME_RANGE","start_time":"15:30:00",'
            '"end_time":"17:00:00","activity_type_code":"SIGHTSEEING",'
            '"location_label":"Bãi Sau, Vũng Tàu"},'
            '"preview":"Bãi Sau từ 15:30 đến 17:00",'
            '"missing_fields":["location"],"preconditions":{}}]}'
        )

        draft = parsed.drafts[0]
        self.assertEqual(draft.status, "READY")
        self.assertEqual(draft.missing_fields, [])
        self.assertEqual(draft.payload["section_id"], "section-1")
        self.assertEqual(draft.payload["data"]["title"], "Bãi Sau")
        self.assertEqual(draft.payload["data"]["system_type"], "SIGHTSEEING")
        self.assertEqual(draft.payload["data"]["location_mode"], "MANUAL")
        self.assertEqual(draft.preview["title"], "Bãi Sau")
        self.assertEqual(draft.preview["start_time"], "15:30:00")
        self.assertEqual(draft.preview["end_time"], "17:00:00")

    def test_timeline_create_normalizes_nested_provider_location(self):
        parsed = parse_agent_response(
            '{"message":"Draft","drafts":[{"action_type":"timeline.activity.create",'
            '"payload":{"section_id":"section-1","data":{"title":"Bãi Sau",'
            '"time_mode":"TIME_RANGE","start_time":"15:30","end_time":"17:00",'
            '"activity_type":{"code":"SIGHTSEEING"},"location":{"location_mode":"STRUCTURED",'
            '"location_label":"Bãi Sau, Vũng Tàu","place":{"provider":"here",'
            '"provider_id":"place-1","title":"Bãi Sau","address":"Vũng Tàu",'
            '"lat":10.345,"lng":107.085}}}}}]}'
        )

        data = parsed.drafts[0].payload["data"]
        self.assertEqual(data["system_type"], "SIGHTSEEING")
        self.assertEqual(data["location_mode"], "STRUCTURED")
        self.assertEqual(data["location_label"], "Bãi Sau, Vũng Tàu")
        self.assertEqual(data["place"]["provider_id"], "place-1")

    def test_rejects_too_many_provider_drafts(self):
        drafts = [
            {
                "action_type": "expense.create",
                "payload": {"title": f"Expense {index}", "total_amount": "100000"},
                "preview": {},
                "missing_fields": [],
                "preconditions": {},
            }
            for index in range(6)
        ]

        with self.assertRaises(ValueError):
            parse_agent_response(json.dumps({"message": "Drafts", "drafts": drafts}))

    def test_rejects_too_many_timeline_create_drafts(self):
        drafts = [
            {
                "action_type": "timeline.activity.create",
                "payload": {
                    "section_id": "section-1",
                    "data": {
                        "title": f"Stop {index}",
                        "time_mode": "FLEXIBLE",
                        "system_type": "SIGHTSEEING",
                    },
                },
                "preview": {},
                "missing_fields": [],
                "preconditions": {},
            }
            for index in range(4)
        ]

        with self.assertRaises(ValueError):
            parse_agent_response(json.dumps({"message": "Drafts", "drafts": drafts}))

    def test_rejects_malformed_draft_shapes(self):
        with self.assertRaises(ValueError):
            parse_agent_response(
                '{"message":"Draft","drafts":[{"action_type":"expense.create",'
                '"required_confirmation":"CAPTAIN","status":"READY",'
                '"payload":null,"preview":{},"missing_fields":[],'
                '"preconditions":{}}]}'
            )
        with self.assertRaises(ValueError):
            parse_agent_response(
                '{"message":"Draft","drafts":[{"action_type":"expense.create",'
                '"required_confirmation":"CAPTAIN","status":"READY",'
                '"payload":{},"preview":{},"missing_fields":{},'
                '"preconditions":{}}]}'
            )


class AgentRunPreconditionTests(TestCase):
    def test_runner_maps_parse_errors_to_provider_bad_response(self):
        captain = create_completed_user(
            "runner-parse-error@example.com",
            "runnerparse",
            "RUN004",
        )
        trip = create_trip(
            captain=captain,
            name="Runner Parse Trip",
            destination="Da Nang",
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 2),
        )
        prompt = ChatMessage.objects.create(
            trip=trip,
            sender=captain,
            sender_display_name_snapshot=captain.display_name,
            sender_identify_tag_snapshot=captain.identify_tag,
            content="@GoPlanAI make bad draft",
            client_message_id=uuid4(),
        )
        interaction = AIInteraction.objects.create(
            trip=trip,
            requested_by=captain,
            prompt_message=prompt,
            prompt="make bad draft",
            status=AIInteractionStatus.RUNNING,
            lock_expires_at=timezone.now() + timedelta(minutes=2),
        )

        with patch(
            "ai.agent.runner.complete_goplan_ai_agent_prompt",
            return_value=DeepSeekResult(
                content='{"message":"Draft","drafts":{}}',
                usage=DeepSeekUsage(input_tokens=1, output_tokens=2, total_tokens=3),
            ),
        ):
            with self.assertRaises(DeepSeekProviderError) as ctx:
                run_goplan_ai_agent(interaction)

        self.assertEqual(
            ctx.exception.error_code,
            AIInteractionErrorCode.PROVIDER_BAD_RESPONSE,
        )

    def test_runner_replaces_provider_preconditions_with_backend_target_version(self):
        captain = create_completed_user("runner-cap@example.com", "runnercap", "RUN001")
        trip = create_trip(
            captain=captain,
            name="Runner Trip",
            destination="Da Nang",
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 2),
        )
        expense = create_expense(
            trip_id=trip.id,
            actor=captain,
            title="Dinner",
            total_amount=Decimal("1200000"),
            collector=captain,
        )
        prompt = ChatMessage.objects.create(
            trip=trip,
            sender=captain,
            sender_display_name_snapshot=captain.display_name,
            sender_identify_tag_snapshot=captain.identify_tag,
            content="@GoPlanAI rename dinner",
            client_message_id=uuid4(),
        )
        interaction = AIInteraction.objects.create(
            trip=trip,
            requested_by=captain,
            prompt_message=prompt,
            prompt="rename dinner",
            status=AIInteractionStatus.RUNNING,
            lock_expires_at=timezone.now() + timedelta(minutes=2),
        )
        provider_content = json.dumps(
            {
                "message": "Draft",
                "drafts": [
                    {
                        "action_type": "expense.update",
                        "payload": {
                            "expense_id": str(expense.id),
                            "title": "Dinner updated",
                        },
                        "preview": {},
                        "missing_fields": [],
                        "preconditions": {
                            "target": {
                                "type": "expense",
                                "id": str(uuid4()),
                                "updated_at": "2000-01-01T00:00:00Z",
                            }
                        },
                    }
                ],
            }
        )

        with patch(
            "ai.agent.runner.complete_goplan_ai_agent_prompt",
            return_value=DeepSeekResult(
                content=provider_content,
                usage=DeepSeekUsage(input_tokens=1, output_tokens=2, total_tokens=3),
            ),
        ):
            result = run_goplan_ai_agent(interaction)

        target = result.drafts[0].preconditions["target"]
        self.assertEqual(target["type"], "expense")
        self.assertEqual(target["id"], str(expense.id))
        self.assertEqual(target["updated_at"], expense.updated_at.isoformat())

    def test_runner_uses_pre_provider_context_version_for_preconditions(self):
        captain = create_completed_user(
            "runner-race@example.com",
            "runnerrace",
            "RUN003",
        )
        trip = create_trip(
            captain=captain,
            name="Runner Race Trip",
            destination="Da Nang",
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 2),
        )
        expense = create_expense(
            trip_id=trip.id,
            actor=captain,
            title="Dinner",
            total_amount=Decimal("1200000"),
            collector=captain,
        )
        original_updated_at = expense.updated_at
        prompt = ChatMessage.objects.create(
            trip=trip,
            sender=captain,
            sender_display_name_snapshot=captain.display_name,
            sender_identify_tag_snapshot=captain.identify_tag,
            content="@GoPlanAI rename dinner",
            client_message_id=uuid4(),
        )
        interaction = AIInteraction.objects.create(
            trip=trip,
            requested_by=captain,
            prompt_message=prompt,
            prompt="rename dinner",
            status=AIInteractionStatus.RUNNING,
            lock_expires_at=timezone.now() + timedelta(minutes=2),
        )
        provider_content = json.dumps(
            {
                "message": "Draft",
                "drafts": [
                    {
                        "action_type": "expense.update",
                        "payload": {
                            "expense_id": str(expense.id),
                            "title": "Dinner updated",
                        },
                        "preview": {},
                        "missing_fields": [],
                        "preconditions": {},
                    }
                ],
            }
        )

        def provider_response(_prompt):
            later = original_updated_at + timedelta(seconds=5)
            Expense.objects.filter(pk=expense.pk).update(
                title="Changed while provider was running",
                updated_at=later,
            )
            return DeepSeekResult(
                content=provider_content,
                usage=DeepSeekUsage(input_tokens=1, output_tokens=2, total_tokens=3),
            )

        with patch(
            "ai.agent.runner.complete_goplan_ai_agent_prompt",
            side_effect=provider_response,
        ):
            result = run_goplan_ai_agent(interaction)

        target = result.drafts[0].preconditions["target"]
        self.assertEqual(target["type"], "expense")
        self.assertEqual(target["id"], str(expense.id))
        self.assertEqual(target["updated_at"], original_updated_at.isoformat())

    def test_runner_adds_backend_preconditions_for_contribution_drafts(self):
        captain = create_completed_user(
            "runner-contrib@example.com",
            "runnercontrib",
            "RUN002",
        )
        trip = create_trip(
            captain=captain,
            name="Runner Contribution Trip",
            destination="Da Nang",
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 2),
        )
        expense = create_expense(
            trip_id=trip.id,
            actor=captain,
            title="Dinner",
            total_amount=Decimal("1200000"),
            collector=captain,
        )
        prompt = ChatMessage.objects.create(
            trip=trip,
            sender=captain,
            sender_display_name_snapshot=captain.display_name,
            sender_identify_tag_snapshot=captain.identify_tag,
            content="@GoPlanAI mark dinner paid",
            client_message_id=uuid4(),
        )
        interaction = AIInteraction.objects.create(
            trip=trip,
            requested_by=captain,
            prompt_message=prompt,
            prompt="mark dinner paid",
            status=AIInteractionStatus.RUNNING,
            lock_expires_at=timezone.now() + timedelta(minutes=2),
        )
        provider_content = json.dumps(
            {
                "message": "Draft",
                "drafts": [
                    {
                        "action_type": "expense.contribution.set",
                        "payload": {
                            "expense_id": str(expense.id),
                            "user_id": str(captain.id),
                            "amount": "1200000",
                        },
                        "preview": {},
                        "missing_fields": [],
                        "preconditions": {},
                    }
                ],
            }
        )

        with patch(
            "ai.agent.runner.complete_goplan_ai_agent_prompt",
            return_value=DeepSeekResult(
                content=provider_content,
                usage=DeepSeekUsage(input_tokens=1, output_tokens=2, total_tokens=3),
            ),
        ):
            result = run_goplan_ai_agent(interaction)

        target = result.drafts[0].preconditions["target"]
        self.assertEqual(target["type"], "expense")
        self.assertEqual(target["id"], str(expense.id))
        self.assertEqual(target["updated_at"], expense.updated_at.isoformat())


class RunnerV2Tests(TestCase):
    def setUp(self):
        self.captain = create_completed_user(
            "v2runner-cap@example.com", "v2runnercap", "V2R001"
        )
        self.trip = create_trip(
            captain=self.captain,
            name="V2 Runner Trip",
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
                    ) % self.section.id,
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
        result = run_goplan_ai_agent_v2(interaction=self.interaction)
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
        result = run_goplan_ai_agent_v2(interaction=self.interaction)
        self.assertEqual(result.error_code, AIInteractionErrorCode.TOOL_UNKNOWN)

    @patch("ai.agent.runner.complete_with_tools")
    def test_invalid_tool_args_returns_validation_failed(self, mock_complete):
        mock_complete.return_value = DeepSeekToolResult(
            text=None,
            tool_calls=[
                ToolCallParsed(
                    id="c1",
                    name="create_expense",
                    # missing required fields (collector_id)
                    arguments_json='{"title":"X","total_amount":"100","currency_code":"VND"}',
                ),
            ],
            usage=DeepSeekUsage(1, 1, 2),
            finish_reason="tool_calls",
        )
        result = run_goplan_ai_agent_v2(interaction=self.interaction)
        self.assertEqual(result.error_code, AIInteractionErrorCode.TOOL_VALIDATION_FAILED)
