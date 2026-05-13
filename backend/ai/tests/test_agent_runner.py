from __future__ import annotations

import json

from django.test import TestCase

from ai.agent.runner import parse_agent_response


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

    def test_action_specific_missing_fields_prevent_invalid_ready_drafts(self):
        cases = (
            (
                "expense.update",
                {"title": "Dinner"},
                [{"name": "expense_id", "label": "Expense"}],
            ),
            (
                "timeline.activity.status.update",
                {"activity_id": "activity-1"},
                [{"name": "status", "label": "Status", "type": "select"}],
            ),
            (
                "settlement.transfer.mark_sent",
                {},
                [{"name": "transfer_id", "label": "Transfer"}],
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
