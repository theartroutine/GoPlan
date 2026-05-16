from django.test import SimpleTestCase
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
