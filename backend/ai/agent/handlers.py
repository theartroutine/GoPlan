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
from expenses.models import SettlementStatus, SettlementTransfer
from trips.models import TimelineActivity


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
    return _create_from_payload(
        trip=trip,
        interaction=interaction,
        action_type=action_type,
        payload=payload,
        target_versions=target_versions,
    )


def _create_from_payload(
    *,
    trip,
    interaction,
    action_type: str,
    payload: dict,
    target_versions: dict | None = None,
) -> HandlerResult:
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


def _user_label(user) -> str:
    return user.display_name or user.email


def _timeline_activity_snapshot(*, trip, activity_id) -> dict:
    try:
        activity = TimelineActivity.objects.get(pk=activity_id, trip=trip)
    except TimelineActivity.DoesNotExist:
        return {}
    snapshot = {
        "title": activity.title,
        "system_type": activity.system_type,
        "time_mode": activity.time_mode,
        "status": activity.status,
        "location_label": activity.location_label,
        "assignee_scope": activity.assignee_scope,
    }
    if activity.start_time:
        snapshot["start_time"] = activity.start_time.isoformat()
    if activity.end_time:
        snapshot["end_time"] = activity.end_time.isoformat()
    return {
        key: value
        for key, value in snapshot.items()
        if value not in ("", None)
    }


def _transfer_snapshot(*, trip, transfer_id) -> dict:
    try:
        transfer = (
            SettlementTransfer.objects
            .select_related("payer", "recipient", "settlement__trip")
            .get(
                pk=transfer_id,
                settlement__trip=trip,
                settlement__status=SettlementStatus.FINALIZED,
            )
        )
    except SettlementTransfer.DoesNotExist:
        return {}
    from_name = _user_label(transfer.payer)
    to_name = _user_label(transfer.recipient)
    return {
        "amount": str(transfer.amount),
        "currency_code": transfer.settlement.trip.currency_code,
        "from_name": from_name,
        "to_name": to_name,
        "title": f"Transfer from {from_name} to {to_name}",
    }


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
    payload = {
        **_to_payload(args),
        **_timeline_activity_snapshot(trip=trip, activity_id=args.activity_id),
    }
    return _create_from_payload(
        trip=trip,
        interaction=interaction,
        action_type="timeline.activity.delete",
        payload=payload,
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
    payload = {
        **_timeline_activity_snapshot(trip=trip, activity_id=args.activity_id),
        **_to_payload(args),
    }
    return _create_from_payload(
        trip=trip,
        interaction=interaction,
        action_type="timeline.activity.status.update",
        payload=payload,
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
    payload = {
        **_to_payload(args),
        **_transfer_snapshot(trip=trip, transfer_id=args.transfer_id),
    }
    return _create_from_payload(
        trip=trip,
        interaction=interaction,
        action_type="settlement.transfer.mark_sent",
        payload=payload,
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
    payload = {
        **_to_payload(args),
        **_transfer_snapshot(trip=trip, transfer_id=args.transfer_id),
    }
    return _create_from_payload(
        trip=trip,
        interaction=interaction,
        action_type="settlement.transfer.confirm_received",
        payload=payload,
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
