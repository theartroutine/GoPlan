from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.test import TestCase, override_settings
from django.utils import timezone

from ai.agent.context import build_agent_context
from ai.models import AIActionDraft, AIActionDraftStatus, AIInteraction, AIInteractionStatus
from chat.models import ChatMessage, ChatMessageHiddenForUser, ChatMessageSenderKind
from expenses.services import create_expense
from test_helpers import create_completed_user
from trips.models import (
    MemberStatus,
    TimelineActivityTimeMode,
    TimelineSystemType,
    TripMember,
    TripRole,
)
from trips.services import create_timeline_activity, create_trip


class AgentContextTests(TestCase):
    def test_context_contains_trip_members_timeline_and_expense_summary(self):
        captain = create_completed_user("ctx-captain@example.com", "ctxcap", "CTX001")
        member = create_completed_user("ctx-member@example.com", "ctxmem", "CTX002")
        trip = create_trip(
            captain=captain,
            name="Context Trip",
            destination="Da Nang",
            start_date="2026-06-01",
            end_date="2026-06-02",
        )
        trip.refresh_from_db()
        TripMember.objects.create(
            trip=trip,
            user=member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        section = trip.timeline_sections.order_by("section_date").first()
        create_timeline_activity(
            trip.id,
            section.id,
            actor=captain,
            data={
                "title": "Museum",
                "time_mode": TimelineActivityTimeMode.FLEXIBLE,
                "system_type": TimelineSystemType.SIGHTSEEING,
                "reminder_offsets_minutes": [],
            },
        )
        create_expense(
            trip_id=trip.id,
            actor=captain,
            title="Dinner",
            total_amount=Decimal("1200000"),
            collector=captain,
        )

        context = build_agent_context(trip=trip, actor=member)

        self.assertEqual(context["trip"]["name"], "Context Trip")
        self.assertEqual(len(context["members"]), 2)
        self.assertEqual(
            context["timeline"]["sections"][0]["activities"][0]["title"],
            "Museum",
        )
        self.assertEqual(context["expenses"]["summary"]["total_amount"], "1200000")

    @override_settings(
        GOPLAN_AI_CONTEXT_TIMELINE_ACTIVITY_LIMIT=1,
        GOPLAN_AI_CONTEXT_EXPENSE_LIMIT=1,
        GOPLAN_AI_CONTEXT_RECENT_CHAT_LIMIT=1,
    )
    def test_context_respects_size_limits(self):
        captain = create_completed_user("ctx-limit@example.com", "ctxlimit", "CTX003")
        trip = create_trip(
            captain=captain,
            name="Context Limit Trip",
            destination="Hue",
            start_date="2026-06-01",
            end_date="2026-06-02",
        )
        trip.refresh_from_db()
        section = trip.timeline_sections.order_by("section_date").first()
        for title in ("Museum", "Dinner"):
            create_timeline_activity(
                trip.id,
                section.id,
                actor=captain,
                data={
                    "title": title,
                    "time_mode": TimelineActivityTimeMode.FLEXIBLE,
                    "system_type": TimelineSystemType.SIGHTSEEING,
                    "reminder_offsets_minutes": [],
                },
            )
            create_expense(
                trip_id=trip.id,
                actor=captain,
                title=title,
                total_amount=Decimal("100000"),
                collector=captain,
            )
            ChatMessage.objects.create(
                trip=trip,
                sender=captain,
                sender_display_name_snapshot=captain.display_name,
                sender_identify_tag_snapshot=captain.identify_tag,
                content=title,
                client_message_id=uuid4(),
            )

        context = build_agent_context(trip=trip, actor=captain)

        activity_count = sum(
            len(section["activities"])
            for section in context["timeline"]["sections"]
        )
        self.assertEqual(activity_count, 1)
        self.assertEqual(len(context["expenses"]["expenses"]), 1)
        self.assertEqual(len(context["recent_chat"]), 1)

    def test_recent_chat_excludes_messages_hidden_for_actor(self):
        captain = create_completed_user(
            "ctx-hide-cap@example.com",
            "ctxhidecap",
            "CTX004",
        )
        member = create_completed_user(
            "ctx-hide-member@example.com",
            "ctxhidemem",
            "CTX005",
        )
        trip = create_trip(
            captain=captain,
            name="Context Hidden Chat Trip",
            destination="Da Nang",
            start_date="2026-06-01",
            end_date="2026-06-02",
        )
        trip.refresh_from_db()
        TripMember.objects.create(
            trip=trip,
            user=member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        visible = ChatMessage.objects.create(
            trip=trip,
            sender=captain,
            sender_display_name_snapshot=captain.display_name,
            sender_identify_tag_snapshot=captain.identify_tag,
            content="Visible message",
            client_message_id=uuid4(),
        )
        hidden = ChatMessage.objects.create(
            trip=trip,
            sender=captain,
            sender_display_name_snapshot=captain.display_name,
            sender_identify_tag_snapshot=captain.identify_tag,
            content="Hidden message",
            client_message_id=uuid4(),
        )
        ChatMessageHiddenForUser.objects.create(message=hidden, user=member)

        context = build_agent_context(trip=trip, actor=member)

        recent_ids = {message["id"] for message in context["recent_chat"]}
        self.assertIn(str(visible.id), recent_ids)
        self.assertNotIn(str(hidden.id), recent_ids)

    def test_context_includes_sections_with_index(self):
        captain = create_completed_user(
            "ctx-sec@example.com",
            "ctxsec",
            "CTX006",
        )
        trip = create_trip(
            captain=captain,
            name="Context Sections Trip",
            destination="Hoi An",
            start_date="2026-07-01",
            end_date="2026-07-02",
        )
        trip.refresh_from_db()

        context = build_agent_context(trip=trip, actor=captain)

        sections = context["sections"]
        self.assertIsInstance(sections, list)
        # Trip with 2 days has 2 sections
        self.assertEqual(len(sections), 2)
        self.assertEqual(sections[0]["section_index"], 1)
        self.assertEqual(sections[1]["section_index"], 2)
        # section_date is ISO formatted string
        first = sections[0]
        self.assertIn("section_id", first)
        self.assertIn("section_date", first)
        self.assertIn("label", first)
        # section_id is a string (UUID representation)
        self.assertIsInstance(first["section_id"], str)
        self.assertRegex(first["section_date"], r"^\d{4}-\d{2}-\d{2}$")

    def test_context_includes_active_drafts_with_summary(self):
        captain = create_completed_user(
            "ctx-draft@example.com",
            "ctxdraft",
            "CTX007",
        )
        trip = create_trip(
            captain=captain,
            name="Context Drafts Trip",
            destination="Nha Trang",
            start_date="2026-08-01",
            end_date="2026-08-02",
        )
        trip.refresh_from_db()
        prompt = ChatMessage.objects.create(
            trip=trip,
            sender=captain,
            sender_display_name_snapshot=captain.display_name,
            sender_identify_tag_snapshot=captain.identify_tag,
            content="@GoPlanAI create activity",
            client_message_id=uuid4(),
        )
        interaction = AIInteraction.objects.create(
            trip=trip,
            requested_by=captain,
            prompt_message=prompt,
            prompt="create activity",
            status=AIInteractionStatus.SUCCEEDED,
            lock_expires_at=timezone.now() + timedelta(minutes=5),
        )
        AIActionDraft.objects.create(
            trip=trip,
            interaction=interaction,
            requested_by=captain,
            action_type="timeline.create_activity",
            status=AIActionDraftStatus.NEEDS_INFO,
            summary="Activity X awaiting time",
            missing_fields=[{"name": "start_time"}, {"name": "end_time"}],
            required_confirmation="CAPTAIN",
            payload={},
            preview={},
            preconditions={},
            expires_at=timezone.now() + timedelta(hours=1),
        )

        context = build_agent_context(trip=trip, actor=captain)

        drafts = context["active_drafts"]
        self.assertIsInstance(drafts, list)
        self.assertEqual(len(drafts), 1)
        draft = drafts[0]
        self.assertEqual(draft["summary"], "Activity X awaiting time")
        self.assertIn("action_type", draft)
        self.assertIn("status", draft)
        self.assertIn("missing_field_names", draft)
        self.assertEqual(draft["missing_field_names"], ["start_time", "end_time"])
        self.assertEqual(draft["action_type"], "timeline.create_activity")
        self.assertEqual(draft["status"], AIActionDraftStatus.NEEDS_INFO)

    def test_context_includes_now_in_trip_timezone(self):
        captain = create_completed_user(
            "ctx-now@example.com",
            "ctxnow",
            "CTX008",
        )
        trip = create_trip(
            captain=captain,
            name="Context Now Trip",
            destination="Hanoi",
            start_date="2026-09-01",
            end_date="2026-09-02",
        )
        trip.refresh_from_db()
        # Default timezone for trips is "Asia/Ho_Chi_Minh"
        self.assertEqual(trip.timezone, "Asia/Ho_Chi_Minh")

        context = build_agent_context(trip=trip, actor=captain)

        self.assertIn("now", context)
        now_str = context["now"]
        self.assertIsInstance(now_str, str)
        # Must be ISO-8601 format containing 'T'
        self.assertIn("T", now_str)
        # Asia/Ho_Chi_Minh is UTC+7, so offset should be +07:00
        self.assertIn("+07:00", now_str)
