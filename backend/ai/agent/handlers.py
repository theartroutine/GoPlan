from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ai.agent import schemas
from ai.agent.drafts import create_action_draft
from ai.agent.draft_mutations import patch_action_draft
from ai.agent.preconditions import (
    action_requires_stale_precondition,
    build_backend_preconditions,
)
from ai.models import AIActionDraft


@dataclass
class HandlerResult:
    draft: Optional[AIActionDraft] = None
    message: Optional[str] = None


def _to_payload(args, extra: dict | None = None) -> dict:
    payload = args.model_dump(mode="json", exclude_none=True)
    if extra:
        payload.update(extra)
    return payload


def _to_activity_data_payload(args, *, id_field: str) -> dict:
    payload = _to_payload(args)
    target_id = payload.pop(id_field)
    return {
        id_field: target_id,
        "data": payload,
    }


def _create(*, trip, interaction, action_type: str, args) -> HandlerResult:
    payload = _to_payload(args)
    preconditions = (
        build_backend_preconditions(
            action_type=action_type,
            trip_id=trip.id,
            payload=payload,
            required=True,
        )
        if action_requires_stale_precondition(action_type)
        else {}
    )
    draft = create_action_draft(
        trip=trip,
        interaction=interaction,
        action_type=action_type,
        payload=payload,
        preconditions=preconditions,
    )
    return HandlerResult(draft=draft)


def create_timeline_activity(*, trip, interaction, actor, args: schemas.CreateTimelineActivityArgs):
    draft = create_action_draft(
        trip=trip,
        interaction=interaction,
        action_type="timeline.activity.create",
        payload=_to_activity_data_payload(args, id_field="section_id"),
    )
    return HandlerResult(draft=draft)


def update_timeline_activity(*, trip, interaction, actor, args: schemas.UpdateTimelineActivityArgs):
    payload = _to_activity_data_payload(args, id_field="activity_id")
    draft = create_action_draft(
        trip=trip,
        interaction=interaction,
        action_type="timeline.activity.update",
        payload=payload,
        preconditions=build_backend_preconditions(
            action_type="timeline.activity.update",
            trip_id=trip.id,
            payload=payload,
            required=True,
        ),
    )
    return HandlerResult(draft=draft)


def delete_timeline_activity(*, trip, interaction, actor, args: schemas.DeleteTimelineActivityArgs):
    return _create(trip=trip, interaction=interaction, action_type="timeline.activity.delete", args=args)


def update_timeline_activity_status(*, trip, interaction, actor, args: schemas.UpdateTimelineActivityStatusArgs):
    return _create(trip=trip, interaction=interaction, action_type="timeline.activity.status.update", args=args)


def create_expense(*, trip, interaction, actor, args: schemas.CreateExpenseArgs):
    return _create(trip=trip, interaction=interaction, action_type="expense.create", args=args)


def update_expense(*, trip, interaction, actor, args: schemas.UpdateExpenseArgs):
    return _create(trip=trip, interaction=interaction, action_type="expense.update", args=args)


def delete_expense(*, trip, interaction, actor, args: schemas.DeleteExpenseArgs):
    return _create(trip=trip, interaction=interaction, action_type="expense.delete", args=args)


def set_expense_contribution(*, trip, interaction, actor, args: schemas.SetExpenseContributionArgs):
    return _create(trip=trip, interaction=interaction, action_type="expense.contribution.set", args=args)


def finalize_settlement(*, trip, interaction, actor, args: schemas.FinalizeSettlementArgs):
    return _create(trip=trip, interaction=interaction, action_type="settlement.finalize", args=args)


def reopen_settlement(*, trip, interaction, actor, args: schemas.ReopenSettlementArgs):
    return _create(trip=trip, interaction=interaction, action_type="settlement.reopen", args=args)


def mark_transfer_sent(*, trip, interaction, actor, args: schemas.MarkTransferSentArgs):
    return _create(trip=trip, interaction=interaction, action_type="settlement.transfer.mark_sent", args=args)


def confirm_transfer_received(*, trip, interaction, actor, args: schemas.ConfirmTransferReceivedArgs):
    return _create(trip=trip, interaction=interaction, action_type="settlement.transfer.confirm_received", args=args)


def update_action_draft(*, trip, interaction, actor, args: schemas.UpdateActionDraftArgs):
    updated = patch_action_draft(
        draft_id=args.draft_id,
        trip_id=trip.id,
        actor=actor,
        patch_payload=dict(args.fields),
    )
    return HandlerResult(draft=updated)


def respond_to_user(*, trip, interaction, actor, args: schemas.RespondToUserArgs):
    return HandlerResult(message=args.message)
