from __future__ import annotations

from dataclasses import dataclass

from django.core.exceptions import ValidationError

from ai.action_types import (
    AI_ACTION_EXPENSE_CONTRIBUTION_SET,
    AI_ACTION_EXPENSE_DELETE,
    AI_ACTION_EXPENSE_UPDATE,
    AI_ACTION_TIMELINE_ACTIVITY_DELETE,
    AI_ACTION_TIMELINE_ACTIVITY_STATUS_UPDATE,
    AI_ACTION_TIMELINE_ACTIVITY_UPDATE,
)
from expenses.models import Expense
from trips.models import TimelineActivity

STALE_PRECONDITION_ACTIONS = {
    AI_ACTION_EXPENSE_CONTRIBUTION_SET,
    AI_ACTION_EXPENSE_DELETE,
    AI_ACTION_EXPENSE_UPDATE,
    AI_ACTION_TIMELINE_ACTIVITY_DELETE,
    AI_ACTION_TIMELINE_ACTIVITY_STATUS_UPDATE,
    AI_ACTION_TIMELINE_ACTIVITY_UPDATE,
}


@dataclass(frozen=True)
class DraftTargetSpec:
    target_type: str
    target_id: object


def action_requires_stale_precondition(action_type: str) -> bool:
    return action_type in STALE_PRECONDITION_ACTIONS


def expected_precondition_target(*, action_type: str, payload: dict) -> DraftTargetSpec | None:
    if action_type in {
        AI_ACTION_EXPENSE_CONTRIBUTION_SET,
        AI_ACTION_EXPENSE_DELETE,
        AI_ACTION_EXPENSE_UPDATE,
    }:
        return DraftTargetSpec(
            target_type="expense",
            target_id=payload.get("expense_id"),
        )
    if action_type in {
        AI_ACTION_TIMELINE_ACTIVITY_DELETE,
        AI_ACTION_TIMELINE_ACTIVITY_STATUS_UPDATE,
        AI_ACTION_TIMELINE_ACTIVITY_UPDATE,
    }:
        return DraftTargetSpec(
            target_type="timeline_activity",
            target_id=payload.get("activity_id"),
        )
    return None


def _resolve_expense_target(*, trip_id, target_id) -> dict:
    expense = Expense.objects.get(pk=target_id, trip_id=trip_id)
    return {
        "type": "expense",
        "id": str(expense.id),
        "updated_at": expense.updated_at.isoformat(),
        "title": expense.title,
        "total_amount": str(expense.total_amount),
    }


def _resolve_timeline_activity_target(*, trip_id, target_id) -> dict:
    activity = TimelineActivity.objects.get(pk=target_id, trip_id=trip_id)
    return {
        "type": "timeline_activity",
        "id": str(activity.id),
        "updated_at": activity.updated_at.isoformat(),
        "title": activity.title,
        "status": activity.status,
    }


def build_backend_preconditions(
    *,
    action_type: str,
    trip_id,
    payload: dict,
    required: bool = False,
) -> dict:
    target_spec = expected_precondition_target(
        action_type=action_type,
        payload=payload,
    )
    if target_spec is None:
        return {}

    if not target_spec.target_id:
        if required:
            raise ValueError("Draft target is required.")
        return {}

    try:
        if target_spec.target_type == "expense":
            target = _resolve_expense_target(
                trip_id=trip_id,
                target_id=target_spec.target_id,
            )
        elif target_spec.target_type == "timeline_activity":
            target = _resolve_timeline_activity_target(
                trip_id=trip_id,
                target_id=target_spec.target_id,
            )
        else:
            raise ValueError("Unsupported draft target type.")
    except (
        Expense.DoesNotExist,
        TimelineActivity.DoesNotExist,
        TypeError,
        ValueError,
        ValidationError,
    ) as exc:
        raise ValueError("Draft target could not be resolved.") from exc

    return {"target": target}
