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


def _to_create_activity_payload(args: schemas.CreateTimelineActivityArgs) -> dict:
    payload = _to_payload(args)
    section_id = payload.pop("section_id", None)
    section_date = payload.pop("section_date", None)
    draft_payload = {"data": payload}
    if section_id is not None:
        draft_payload["section_id"] = section_id
    elif section_date is not None:
        draft_payload["section_date"] = section_date
    return draft_payload


def _create(
    *,
    trip,
    interaction,
    action_type: str,
    args,
    target_versions: dict | None = None,
) -> HandlerResult:
    payload = _to_payload(args)
    preconditions = (
        build_backend_preconditions(
            action_type=action_type,
            trip_id=trip.id,
            payload=payload,
            required=True,
            target_versions=target_versions,
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


def create_timeline_activity(
    *,
    trip,
    interaction,
    actor,
    args: schemas.CreateTimelineActivityArgs,
    target_versions: dict | None = None,
):
    draft = create_action_draft(
        trip=trip,
        interaction=interaction,
        action_type="timeline.activity.create",
        payload=_to_create_activity_payload(args),
    )
    return HandlerResult(draft=draft)


def update_timeline_activity(
    *,
    trip,
    interaction,
    actor,
    args: schemas.UpdateTimelineActivityArgs,
    target_versions: dict | None = None,
):
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
            target_versions=target_versions,
        ),
    )
    return HandlerResult(draft=draft)


def delete_timeline_activity(
    *,
    trip,
    interaction,
    actor,
    args: schemas.DeleteTimelineActivityArgs,
    target_versions: dict | None = None,
):
    return _create(
        trip=trip,
        interaction=interaction,
        action_type="timeline.activity.delete",
        args=args,
        target_versions=target_versions,
    )


def update_timeline_activity_status(
    *,
    trip,
    interaction,
    actor,
    args: schemas.UpdateTimelineActivityStatusArgs,
    target_versions: dict | None = None,
):
    return _create(
        trip=trip,
        interaction=interaction,
        action_type="timeline.activity.status.update",
        args=args,
        target_versions=target_versions,
    )


def create_expense(
    *,
    trip,
    interaction,
    actor,
    args: schemas.CreateExpenseArgs,
    target_versions: dict | None = None,
):
    return _create(
        trip=trip,
        interaction=interaction,
        action_type="expense.create",
        args=args,
        target_versions=target_versions,
    )


def update_expense(
    *,
    trip,
    interaction,
    actor,
    args: schemas.UpdateExpenseArgs,
    target_versions: dict | None = None,
):
    return _create(
        trip=trip,
        interaction=interaction,
        action_type="expense.update",
        args=args,
        target_versions=target_versions,
    )


def delete_expense(
    *,
    trip,
    interaction,
    actor,
    args: schemas.DeleteExpenseArgs,
    target_versions: dict | None = None,
):
    return _create(
        trip=trip,
        interaction=interaction,
        action_type="expense.delete",
        args=args,
        target_versions=target_versions,
    )


def set_expense_contribution(
    *,
    trip,
    interaction,
    actor,
    args: schemas.SetExpenseContributionArgs,
    target_versions: dict | None = None,
):
    return _create(
        trip=trip,
        interaction=interaction,
        action_type="expense.contribution.set",
        args=args,
        target_versions=target_versions,
    )


def finalize_settlement(
    *,
    trip,
    interaction,
    actor,
    args: schemas.FinalizeSettlementArgs,
    target_versions: dict | None = None,
):
    return _create(
        trip=trip,
        interaction=interaction,
        action_type="settlement.finalize",
        args=args,
        target_versions=target_versions,
    )


def reopen_settlement(
    *,
    trip,
    interaction,
    actor,
    args: schemas.ReopenSettlementArgs,
    target_versions: dict | None = None,
):
    return _create(
        trip=trip,
        interaction=interaction,
        action_type="settlement.reopen",
        args=args,
        target_versions=target_versions,
    )


def mark_transfer_sent(
    *,
    trip,
    interaction,
    actor,
    args: schemas.MarkTransferSentArgs,
    target_versions: dict | None = None,
):
    return _create(
        trip=trip,
        interaction=interaction,
        action_type="settlement.transfer.mark_sent",
        args=args,
        target_versions=target_versions,
    )


def confirm_transfer_received(
    *,
    trip,
    interaction,
    actor,
    args: schemas.ConfirmTransferReceivedArgs,
    target_versions: dict | None = None,
):
    return _create(
        trip=trip,
        interaction=interaction,
        action_type="settlement.transfer.confirm_received",
        args=args,
        target_versions=target_versions,
    )


def update_action_draft(
    *,
    trip,
    interaction,
    actor,
    args: schemas.UpdateActionDraftArgs,
    target_versions: dict | None = None,
):
    updated = patch_action_draft(
        draft_id=args.draft_id,
        trip_id=trip.id,
        actor=actor,
        patch_payload=dict(args.fields),
    )
    return HandlerResult(draft=updated)


def respond_to_user(
    *,
    trip,
    interaction,
    actor,
    args: schemas.RespondToUserArgs,
    target_versions: dict | None = None,
):
    return HandlerResult(message=args.message)
