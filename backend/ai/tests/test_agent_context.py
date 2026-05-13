from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from django.test import TestCase, override_settings

from ai.agent.context import build_agent_context
from chat.models import ChatMessage
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
