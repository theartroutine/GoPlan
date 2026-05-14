from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings

from chat.models import ChatMessage
from expenses.serializers import serialize_dashboard_response
from expenses.services import build_expense_dashboard
from trips.models import MemberStatus, TripRole, TripStatus
from trips.serializers import build_timeline_response
from trips.services import get_trip_timeline


@dataclass(frozen=True)
class AgentContextBundle:
    context: dict
    target_versions: dict


def _member_payload(membership) -> dict:
    return {
        "id": str(membership.user_id),
        "display_name": membership.user.display_name,
        "identify_tag": membership.user.identify_tag,
        "role": membership.role,
    }


def _limit_timeline_activities(timeline: dict) -> dict:
    remaining = settings.GOPLAN_AI_CONTEXT_TIMELINE_ACTIVITY_LIMIT
    sections = []
    for section in timeline["sections"]:
        activities = section.get("activities", [])
        limited_activities = activities[:remaining]
        remaining = max(remaining - len(limited_activities), 0)
        sections.append({**section, "activities": limited_activities})
    return {**timeline, "sections": sections}


def _included_timeline_activity_ids(timeline: dict) -> set[str]:
    return {
        str(activity["id"])
        for section in timeline["sections"]
        for activity in section.get("activities", [])
        if activity.get("id")
    }


def _timeline_activity_target_versions(*, sections, timeline: dict) -> dict:
    included_ids = _included_timeline_activity_ids(timeline)
    versions = {}
    for section in sections:
        for activity in section.activities.all():
            activity_id = str(activity.id)
            if activity_id not in included_ids:
                continue
            versions[activity_id] = {
                "type": "timeline_activity",
                "id": activity_id,
                "updated_at": activity.updated_at.isoformat(),
                "title": activity.title,
                "status": activity.status,
            }
    return versions


def _expense_target_versions(*, expense_rows: list[dict]) -> dict:
    versions = {}
    for row in expense_rows:
        expense = row["expense"]
        expense_id = str(expense.id)
        versions[expense_id] = {
            "type": "expense",
            "id": expense_id,
            "updated_at": expense.updated_at.isoformat(),
            "title": expense.title,
            "total_amount": str(expense.total_amount),
        }
    return versions


def _recent_chat_payload(*, trip, actor, limit: int) -> list[dict]:
    messages = (
        ChatMessage.objects
        .filter(trip=trip)
        .exclude(hidden_for_users__user=actor)
        .select_related("sender")
        .order_by("-created_at", "-id")[:limit]
    )
    return [
        {
            "id": str(message.id),
            "sender_kind": message.sender_kind,
            "sender_display_name": message.sender_display_name_snapshot,
            "content": (
                "" if message.deleted_for_everyone_at is not None else message.content
            ),
            "created_at": message.created_at.isoformat(),
        }
        for message in reversed(list(messages))
    ]


def build_agent_context_bundle(*, trip, actor) -> AgentContextBundle:
    memberships = list(
        trip.memberships
        .filter(status=MemberStatus.ACTIVE)
        .select_related("user")
        .order_by("joined_at", "id")
    )
    sections, custom_types = get_trip_timeline(trip)
    is_captain = any(
        membership.user_id == actor.id and membership.role == TripRole.CAPTAIN
        for membership in memberships
    )
    timeline = build_timeline_response(
        trip=trip,
        sections=sections,
        custom_types=custom_types,
        is_captain=is_captain,
        is_terminal=trip.status in {TripStatus.COMPLETED, TripStatus.CANCELLED},
        viewer_user_id=actor.id,
    )
    timeline = _limit_timeline_activities(timeline)
    dashboard = build_expense_dashboard(trip_id=trip.id, actor=actor)
    limited_expense_rows = dashboard["expenses"][
        :settings.GOPLAN_AI_CONTEXT_EXPENSE_LIMIT
    ]
    expenses = serialize_dashboard_response(dashboard, request_user=actor)
    expenses["expenses"] = expenses["expenses"][
        :settings.GOPLAN_AI_CONTEXT_EXPENSE_LIMIT
    ]

    context = {
        "trip": {
            "id": str(trip.id),
            "name": trip.name,
            "destination": trip.destination,
            "start_date": trip.start_date.isoformat(),
            "end_date": trip.end_date.isoformat(),
            "currency_code": trip.currency_code,
            "timezone": trip.timezone,
            "status": trip.status,
        },
        "actor": {
            "id": str(actor.id),
            "display_name": actor.display_name,
        },
        "members": [_member_payload(membership) for membership in memberships],
        "timeline": timeline,
        "expenses": expenses,
        "recent_chat": _recent_chat_payload(
            trip=trip,
            actor=actor,
            limit=settings.GOPLAN_AI_CONTEXT_RECENT_CHAT_LIMIT,
        ),
    }
    return AgentContextBundle(
        context=context,
        target_versions={
            "expense": _expense_target_versions(expense_rows=limited_expense_rows),
            "timeline_activity": _timeline_activity_target_versions(
                sections=sections,
                timeline=timeline,
            ),
        },
    )


def build_agent_context(*, trip, actor) -> dict:
    return build_agent_context_bundle(trip=trip, actor=actor).context
