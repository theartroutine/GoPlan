from django.test import TestCase
from ai.agent.display import build_display

class DisplayBuilderTests(TestCase):
    def test_timeline_activity_create_whitelists_user_fields(self):
        payload = {
            "section_id": "abc-def",
            "title": "Hồ Xuân Hương",
            "system_type": "SIGHTSEEING",
            "time_mode": "TIME_RANGE",
            "start_time": "2026-04-20T08:00:00+07:00",
            "end_time": "2026-04-20T10:00:00+07:00",
            "location_label": "Đà Lạt",
            "assignee_scope": "GROUP",
            "custom_type_id": "uuid-leak",
            "reminder_offsets_minutes": [],
        }
        display = build_display(
            action_type="timeline.activity.create",
            payload=payload,
            trip_context={"timezone": "Asia/Ho_Chi_Minh", "currency_code": "VND"},
        )
        self.assertEqual(display["icon"], "activity")
        self.assertEqual(display["tone"], "create")
        self.assertIn("Sightseeing", display["kicker"])
        self.assertEqual(display["title"], "Hồ Xuân Hương")
        chip_labels = [c["label"] for c in display.get("chips", [])]
        self.assertTrue(any("Đà Lạt" in label for label in chip_labels))
        serialized = repr(display)
        self.assertNotIn("section_id", serialized)
        self.assertNotIn("custom_type_id", serialized)
        self.assertNotIn("uuid-leak", serialized)
        self.assertNotIn("reminder_offsets_minutes", serialized)
        self.assertNotIn("TIME_RANGE", serialized)

    def test_timeline_activity_create_reads_normalized_nested_data(self):
        payload = {
            "section_id": "abc-def",
            "data": {
                "title": "Dinh I",
                "system_type": "SIGHTSEEING",
                "time_mode": "TIME_RANGE",
                "start_time": "08:30:00",
                "end_time": "10:00:00",
                "location_label": "Dinh I Palace",
                "location_note": "Enter through the main gate",
                "assignee_scope": "EVERYONE",
                "note": "Keep the visit relaxed.",
                "meeting_point": "Hotel lobby",
                "custom_type_id": "uuid-leak",
                "reminder_offsets_minutes": [],
            },
        }
        display = build_display(
            action_type="timeline.activity.create",
            payload=payload,
            trip_context={"timezone": "Asia/Ho_Chi_Minh", "currency_code": "VND"},
        )

        self.assertEqual(display["title"], "Dinh I")
        self.assertIn("Sightseeing", display["kicker"])
        chip_labels = [c["label"] for c in display.get("chips", [])]
        self.assertIn("08:30 – 10:00", chip_labels)
        self.assertIn("Dinh I Palace", chip_labels)
        self.assertIn("Whole group", chip_labels)
        meta = {item["label"]: item["value"] for item in display.get("meta", [])}
        self.assertEqual(meta["Meeting point"], "Hotel lobby")
        self.assertEqual(meta["Note"], "Keep the visit relaxed.")
        self.assertEqual(meta["Location note"], "Enter through the main gate")
        serialized = repr(display)
        self.assertNotIn("section_id", serialized)
        self.assertNotIn("custom_type_id", serialized)
        self.assertNotIn("uuid-leak", serialized)
        self.assertNotIn("reminder_offsets_minutes", serialized)
        self.assertNotIn("TIME_RANGE", serialized)

    def test_expense_create_produces_amount_hero(self):
        payload = {
            "title": "Vé xe Phương Trang",
            "total_amount": "2000000",
            "currency_code": "VND",
            "collector_id": "fd46f358-653b-461d-8c41-9d950a2eb8d8",
        }
        display = build_display(
            action_type="expense.create",
            payload=payload,
            trip_context={"timezone": "Asia/Ho_Chi_Minh", "currency_code": "VND"},
        )
        self.assertEqual(display["icon"], "expense")
        self.assertEqual(display["hero"]["kind"], "amount")
        self.assertEqual(display["hero"]["currency"], "VND")
        self.assertIn("2,000,000", display["hero"]["value"])
        self.assertNotIn("fd46f358", repr(display))

    def test_unknown_action_type_returns_generic_display(self):
        display = build_display(
            action_type="unknown.action",
            payload={"title": "X"},
            trip_context={"timezone": "UTC", "currency_code": "USD"},
        )
        self.assertEqual(display["icon"], "info")
        self.assertEqual(display["title"], "X")
