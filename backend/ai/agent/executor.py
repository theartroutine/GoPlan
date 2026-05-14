from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from ai.action_types import (
    AI_ACTION_EXPENSE_CONTRIBUTION_SET,
    AI_ACTION_EXPENSE_CREATE,
    AI_ACTION_EXPENSE_DELETE,
    AI_ACTION_EXPENSE_UPDATE,
    AI_ACTION_SETTLEMENT_FINALIZE,
    AI_ACTION_SETTLEMENT_REOPEN,
    AI_ACTION_SETTLEMENT_TRANSFER_CONFIRM_RECEIVED,
    AI_ACTION_SETTLEMENT_TRANSFER_MARK_SENT,
    AI_ACTION_TIMELINE_ACTIVITY_CREATE,
    AI_ACTION_TIMELINE_ACTIVITY_DELETE,
    AI_ACTION_TIMELINE_ACTIVITY_STATUS_UPDATE,
    AI_ACTION_TIMELINE_ACTIVITY_UPDATE,
)
from ai.agent.drafts import can_confirm_action_draft
from ai.agent.payload_validation import missing_payload_field_names
from ai.agent.preconditions import expected_precondition_target
from ai.models import AIActionDraft, AIActionDraftStatus
from expenses.models import Expense
from expenses.services import (
    confirm_transfer_received,
    create_expense,
    delete_expense,
    finalize_settlement,
    mark_transfer_sent,
    reopen_settlement,
    set_contribution,
    update_expense,
)
from trips.models import TimelineActivity, TripMember
from trips.services import (
    create_timeline_activity,
    delete_timeline_activity,
    patch_timeline_activity,
    update_timeline_activity_status,
)


class AIActionDraftError(Exception):
    error_code = "AI_DRAFT_ERROR"


class AIActionDraftForbiddenError(AIActionDraftError):
    error_code = "AI_DRAFT_FORBIDDEN"


class AIActionDraftNotReadyError(AIActionDraftError):
    error_code = "AI_DRAFT_NOT_READY"


class AIActionDraftExpiredError(AIActionDraftError):
    error_code = "AI_DRAFT_EXPIRED"


class AIActionDraftStaleError(AIActionDraftError):
    error_code = "AI_DRAFT_STALE"


def _parse_aware_datetime(value: str):
    parsed = parse_datetime(value)
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _check_object_precondition(*, current_updated_at, expected_updated_at) -> None:
    expected = _parse_aware_datetime(str(expected_updated_at))
    if expected is None:
        raise AIActionDraftStaleError("Draft precondition is invalid.")
    if current_updated_at > expected:
        raise AIActionDraftStaleError(
            "Draft target changed. Ask GoPlanAI to regenerate it."
        )


def _check_preconditions(draft: AIActionDraft) -> None:
    expected_target = expected_precondition_target(
        action_type=draft.action_type,
        payload=draft.payload,
    )
    if expected_target is None:
        return

    target = draft.preconditions.get("target", {})
    if not isinstance(target, dict) or not target:
        raise AIActionDraftStaleError("Draft target precondition is missing.")

    target_type = target.get("type")
    target_id = target.get("id")
    expected_updated_at = target.get("updated_at")
    if (
        target_type != expected_target.target_type
        or str(target_id) != str(expected_target.target_id)
        or not expected_updated_at
    ):
        raise AIActionDraftStaleError(
            "Draft target precondition does not match payload."
        )

    if target_type == "expense":
        try:
            expense = Expense.objects.select_for_update().get(
                pk=expected_target.target_id,
                trip_id=draft.trip_id,
            )
        except Expense.DoesNotExist as exc:
            raise AIActionDraftStaleError("Draft target no longer exists.") from exc
        _check_object_precondition(
            current_updated_at=expense.updated_at,
            expected_updated_at=expected_updated_at,
        )
        return

    if target_type == "timeline_activity":
        try:
            activity = TimelineActivity.objects.select_for_update().get(
                pk=expected_target.target_id,
                trip_id=draft.trip_id,
            )
        except TimelineActivity.DoesNotExist as exc:
            raise AIActionDraftStaleError("Draft target no longer exists.") from exc
        _check_object_precondition(
            current_updated_at=activity.updated_at,
            expected_updated_at=expected_updated_at,
        )
        return

    raise AIActionDraftStaleError("Draft target precondition is unsupported.")


def _validate_action_payload_ready(draft: AIActionDraft) -> None:
    missing_names = missing_payload_field_names(
        action_type=draft.action_type,
        payload=draft.payload,
    )
    if missing_names:
        raise AIActionDraftNotReadyError(
            f"Draft is missing required field: {missing_names[0]}."
        )


def _resolve_contribution_user_id(*, trip_id, payload: dict):
    target_id = (
        payload.get("user_id")
        or payload.get("target_user_id")
        or payload.get("member_id")
        or payload.get("payer_id")
        or payload.get("collector_id")
    )
    if not target_id:
        raise AIActionDraftNotReadyError("Contribution target user is required.")

    if TripMember.objects.filter(trip_id=trip_id, user_id=target_id).exists():
        return target_id

    membership = TripMember.objects.filter(pk=target_id, trip_id=trip_id).first()
    if membership is not None:
        return membership.user_id

    return target_id


def _contribution_amount(payload: dict):
    for field in ("amount", "paid_amount", "contribution_amount"):
        if field in payload:
            return payload[field]
    raise AIActionDraftNotReadyError("Contribution amount is required.")


def _normalize_contribution_payload(
    raw_payload,
    *,
    expense_id,
    fallback_user_id=None,
) -> dict:
    if isinstance(raw_payload, dict):
        return {
            **raw_payload,
            "expense_id": expense_id,
            "user_id": (
                raw_payload.get("user_id")
                or raw_payload.get("target_user_id")
                or raw_payload.get("member_id")
                or fallback_user_id
            ),
            "amount": _contribution_amount(raw_payload),
        }
    return {
        "expense_id": expense_id,
        "user_id": fallback_user_id,
        "amount": raw_payload,
    }


def _extract_explicit_contribution_payloads(payload: dict) -> list[dict]:
    expense_id = payload["expense_id"]
    contributions = payload.get("contributions")
    if isinstance(contributions, list) and contributions:
        return [
            _normalize_contribution_payload(
                contribution_payload,
                expense_id=expense_id,
            )
            for contribution_payload in contributions
        ]

    member_contributions = payload.get("member_contributions")
    if isinstance(member_contributions, dict) and member_contributions:
        return [
            _normalize_contribution_payload(
                contribution_payload,
                expense_id=expense_id,
                fallback_user_id=member_id,
            )
            for member_id, contribution_payload in member_contributions.items()
        ]

    return []


def _should_mark_all_participants_paid(payload: dict) -> bool:
    return str(payload.get("scope", "")).lower() in {
        "all_participants_paid",
        "all_participants",
        "everyone_paid",
    }


def _build_all_participant_share_payloads(*, draft: AIActionDraft, payload: dict) -> list[dict]:
    try:
        expense = (
            Expense.objects
            .prefetch_related("participants")
            .get(pk=payload["expense_id"], trip_id=draft.trip_id)
        )
    except Expense.DoesNotExist as exc:
        raise AIActionDraftStaleError("Draft target no longer exists.") from exc

    return [
        {
            "expense_id": payload["expense_id"],
            "user_id": str(participant.user_id),
            "amount": str(participant.share_amount),
        }
        for participant in expense.participants.all()
    ]


def _set_single_contribution(*, draft: AIActionDraft, actor, payload: dict):
    return set_contribution(
        trip_id=draft.trip_id,
        expense_id=payload["expense_id"],
        target_user_id=_resolve_contribution_user_id(
            trip_id=draft.trip_id,
            payload=payload,
        ),
        actor=actor,
        amount=Decimal(str(_contribution_amount(payload))),
    )


def _execute(draft: AIActionDraft, *, actor) -> dict:
    payload = draft.payload
    if draft.action_type == AI_ACTION_EXPENSE_CREATE:
        expense = create_expense(
            trip_id=draft.trip_id,
            actor=actor,
            title=payload["title"],
            description=payload.get("description", ""),
            total_amount=Decimal(str(payload["total_amount"])),
            collector_id=payload.get("collector_id"),
        )
        return {"object_type": "expense", "object_id": str(expense.id)}

    if draft.action_type == AI_ACTION_EXPENSE_UPDATE:
        expense = update_expense(
            trip_id=draft.trip_id,
            expense_id=payload["expense_id"],
            actor=actor,
            title=payload.get("title"),
            description=payload.get("description"),
            total_amount=(
                Decimal(str(payload["total_amount"]))
                if "total_amount" in payload
                else None
            ),
            collector_id=payload.get("collector_id"),
            update_collector="collector_id" in payload,
        )
        return {"object_type": "expense", "object_id": str(expense.id)}

    if draft.action_type == AI_ACTION_EXPENSE_DELETE:
        delete_expense(
            trip_id=draft.trip_id,
            expense_id=payload["expense_id"],
            actor=actor,
        )
        return {
            "object_type": "expense",
            "object_id": payload["expense_id"],
            "deleted": True,
        }

    if draft.action_type == AI_ACTION_EXPENSE_CONTRIBUTION_SET:
        contribution_payloads = _extract_explicit_contribution_payloads(payload)
        if not contribution_payloads and _should_mark_all_participants_paid(payload):
            contribution_payloads = _build_all_participant_share_payloads(
                draft=draft,
                payload=payload,
            )

        if contribution_payloads:
            updated = []
            for contribution_payload in contribution_payloads:
                contribution = _set_single_contribution(
                    draft=draft,
                    actor=actor,
                    payload=contribution_payload,
                )
                updated.append(str(contribution.id))
            return {
                "object_type": "expense_contribution_batch",
                "object_ids": updated,
                "updated_count": len(updated),
            }

        contribution = _set_single_contribution(
            draft=draft,
            actor=actor,
            payload=payload,
        )
        return {
            "object_type": "expense_contribution",
            "object_id": str(contribution.id),
        }

    if draft.action_type == AI_ACTION_TIMELINE_ACTIVITY_CREATE:
        activity = create_timeline_activity(
            draft.trip_id,
            payload["section_id"],
            actor=actor,
            data=payload["data"],
        )
        return {"object_type": "timeline_activity", "object_id": str(activity.id)}

    if draft.action_type == AI_ACTION_TIMELINE_ACTIVITY_UPDATE:
        activity = patch_timeline_activity(
            draft.trip_id,
            payload["activity_id"],
            actor=actor,
            data=payload["data"],
        )
        return {"object_type": "timeline_activity", "object_id": str(activity.id)}

    if draft.action_type == AI_ACTION_TIMELINE_ACTIVITY_DELETE:
        delete_timeline_activity(
            draft.trip_id,
            payload["activity_id"],
            actor=actor,
        )
        return {
            "object_type": "timeline_activity",
            "object_id": payload["activity_id"],
            "deleted": True,
        }

    if draft.action_type == AI_ACTION_TIMELINE_ACTIVITY_STATUS_UPDATE:
        activity = update_timeline_activity_status(
            draft.trip_id,
            payload["activity_id"],
            actor=actor,
            status=payload["status"],
        )
        return {
            "object_type": "timeline_activity",
            "object_id": str(activity.id),
            "status": activity.status,
        }

    if draft.action_type == AI_ACTION_SETTLEMENT_FINALIZE:
        settlement = finalize_settlement(trip_id=draft.trip_id, actor=actor)
        return {"object_type": "settlement", "object_id": str(settlement.id)}

    if draft.action_type == AI_ACTION_SETTLEMENT_REOPEN:
        settlement = reopen_settlement(trip_id=draft.trip_id, actor=actor)
        return {
            "object_type": "settlement",
            "object_id": str(settlement.id),
            "status": settlement.status,
        }

    if draft.action_type == AI_ACTION_SETTLEMENT_TRANSFER_MARK_SENT:
        transfer = mark_transfer_sent(
            trip_id=draft.trip_id,
            transfer_id=payload["transfer_id"],
            actor=actor,
        )
        return {"object_type": "settlement_transfer", "object_id": str(transfer.id)}

    if draft.action_type == AI_ACTION_SETTLEMENT_TRANSFER_CONFIRM_RECEIVED:
        transfer = confirm_transfer_received(
            trip_id=draft.trip_id,
            transfer_id=payload["transfer_id"],
            actor=actor,
        )
        return {"object_type": "settlement_transfer", "object_id": str(transfer.id)}

    raise AIActionDraftNotReadyError("Unsupported draft action.")


def mark_action_draft_failed(
    *,
    draft_id,
    trip_id,
    error_code: str,
    error_detail: str,
) -> AIActionDraft | None:
    with transaction.atomic():
        try:
            draft = (
                AIActionDraft.objects
                .select_for_update()
                .select_related("response_message")
                .get(pk=draft_id, trip_id=trip_id)
            )
        except AIActionDraft.DoesNotExist:
            return None
        if draft.status != AIActionDraftStatus.READY:
            return draft
        draft.status = AIActionDraftStatus.FAILED
        draft.error_code = error_code[:64]
        draft.error_detail = error_detail[:255]
        draft.save(
            update_fields=[
                "status",
                "error_code",
                "error_detail",
                "updated_at",
            ]
        )
        draft.response_message.updated_at = timezone.now()
        draft.response_message.save(update_fields=["updated_at"])
        return draft


@transaction.atomic
def confirm_action_draft(*, draft_id, trip_id, actor) -> AIActionDraft:
    draft = (
        AIActionDraft.objects
        .select_for_update()
        .select_related("response_message")
        .get(pk=draft_id, trip_id=trip_id)
    )
    if draft.status == AIActionDraftStatus.CONFIRMED:
        return draft
    if draft.status != AIActionDraftStatus.READY:
        raise AIActionDraftNotReadyError("Draft is not ready.")
    if draft.expires_at <= timezone.now():
        draft.status = AIActionDraftStatus.EXPIRED
        draft.save(update_fields=["status", "updated_at"])
        raise AIActionDraftExpiredError("Draft expired.")
    _validate_action_payload_ready(draft)
    if not can_confirm_action_draft(draft, viewer=actor):
        raise AIActionDraftForbiddenError("You cannot confirm this draft.")

    _check_preconditions(draft)
    result = _execute(draft, actor=actor)
    draft.status = AIActionDraftStatus.CONFIRMED
    draft.confirmed_by = actor
    draft.confirmed_at = timezone.now()
    draft.result = result
    draft.save(
        update_fields=[
            "status",
            "confirmed_by",
            "confirmed_at",
            "result",
            "updated_at",
        ]
    )
    draft.response_message.updated_at = timezone.now()
    draft.response_message.save(update_fields=["updated_at"])
    return draft
