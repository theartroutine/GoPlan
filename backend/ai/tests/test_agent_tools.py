from datetime import timedelta
from uuid import uuid4

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from ai.agent.tools import TOOLS, openai_tool_params, resolve_tool


class ToolRegistryTests(SimpleTestCase):
    def test_registry_includes_all_expected_tools(self):
        names = {t.name for t in TOOLS}
        self.assertIn("create_timeline_activity", names)
        self.assertIn("create_expense", names)
        self.assertIn("update_action_draft", names)
        self.assertIn("respond_to_user", names)

    def test_openai_tool_params_round_trip(self):
        params = openai_tool_params()
        self.assertEqual(len(params), len(TOOLS))
        for p in params:
            self.assertEqual(p["type"], "function")
            self.assertIn("name", p["function"])
            self.assertIn("parameters", p["function"])

    def test_resolve_tool_returns_handler(self):
        tool = resolve_tool("create_timeline_activity")
        self.assertEqual(tool.name, "create_timeline_activity")
        self.assertTrue(callable(tool.handler))


class ToolHandlerTests(TestCase):
    def setUp(self):
        from chat.models import ChatMessage
        from ai.models import AIInteraction, AIInteractionStatus
        from test_helpers import create_completed_user
        from trips.services import create_trip

        self.user = create_completed_user(
            "tool-handler@example.com",
            "toolhandler",
            "TH001",
        )
        self.trip = create_trip(
            captain=self.user,
            name="Tool Handler Trip",
            destination="Hanoi",
            start_date="2026-07-01",
            end_date="2026-07-03",
        )
        self.prompt_message = ChatMessage.objects.create(
            trip=self.trip,
            sender=self.user,
            sender_display_name_snapshot=self.user.display_name,
            sender_identify_tag_snapshot=self.user.identify_tag,
            content="@GoPlanAI add activity",
            client_message_id=uuid4(),
        )
        self.interaction = AIInteraction.objects.create(
            trip=self.trip,
            requested_by=self.user,
            prompt_message=self.prompt_message,
            prompt="add activity",
            status=AIInteractionStatus.RUNNING,
            lock_expires_at=timezone.now() + timedelta(minutes=5),
        )

    def test_create_timeline_activity_persists_draft(self):
        from ai.agent import handlers, schemas
        from ai.models import AIActionDraft

        section_id = uuid4()
        result = handlers.create_timeline_activity(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.CreateTimelineActivityArgs(
                section_id=section_id,
                title="X",
                system_type="SIGHTSEEING",
                time_mode="ANCHOR",
            ),
        )
        self.assertIsInstance(result.draft, AIActionDraft)
        self.assertEqual(result.draft.action_type, "timeline.activity.create")
        self.assertEqual(result.draft.display["icon"], "activity")

    def test_respond_to_user_returns_message_without_draft(self):
        from ai.agent import handlers, schemas

        result = handlers.respond_to_user(
            trip=self.trip,
            interaction=self.interaction,
            actor=self.user,
            args=schemas.RespondToUserArgs(message="hello"),
        )
        self.assertIsNone(result.draft)
        self.assertEqual(result.message, "hello")
