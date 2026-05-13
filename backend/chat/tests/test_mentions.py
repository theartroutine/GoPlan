from django.test import SimpleTestCase

from chat.mentions import extract_goplan_ai_prompt


class GoPlanAIMentionTests(SimpleTestCase):
    def test_no_mention(self):
        has_mention, prompt, display = extract_goplan_ai_prompt("hello team")
        self.assertFalse(has_mention)
        self.assertEqual(prompt, "hello team")
        self.assertEqual(display, "hello team")

    def test_mention_at_end_moves_to_front(self):
        has_mention, prompt, display = extract_goplan_ai_prompt("plan day 1 @GoPlanAI")
        self.assertTrue(has_mention)
        self.assertEqual(prompt, "plan day 1")
        self.assertEqual(display, "@GoPlanAI plan day 1")

    def test_empty_prompt(self):
        has_mention, prompt, display = extract_goplan_ai_prompt("@GoPlanAI")
        self.assertTrue(has_mention)
        self.assertEqual(prompt, "")
        self.assertEqual(display, "@GoPlanAI")
