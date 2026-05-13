from __future__ import annotations

from django.utils import timezone

from ai.action_types import (
    AI_CONFIRMATION_CAPTAIN,
    AI_CONFIRMATION_TIMELINE_ACTIVITY_STATUS,
    AI_CONFIRMATION_TRANSFER_PAYER,
    AI_CONFIRMATION_TRANSFER_RECIPIENT,
)
from ai.agent.draft_fields import normalize_missing_fields
from ai.models import AIActionDraft, AIActionDraftStatus
from expenses.models import SettlementStatus, SettlementTransfer
from trips.models import MemberStatus, TripMember, TripRole
from trips.services import can_update_timeline_activity_status

FINAL_DRAFT_STATUSES = {
    AIActionDraftStatus.CONFIRMED,
    AIActionDraftStatus.CANCELLED,
    AIActionDraftStatus.EXPIRED,
    AIActionDraftStatus.FAILED,
}


def _is_active_captain(*, trip_id, user) -> bool:
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    return TripMember.objects.filter(
        trip_id=trip_id,
        user=user,
        role=TripRole.CAPTAIN,
        status=MemberStatus.ACTIVE,
    ).exists()


def _can_confirm_transfer(draft: AIActionDraft, viewer) -> bool:
    if viewer is None or not getattr(viewer, "is_authenticated", False):
        return False

    transfer = draft.preconditions.get("transfer", {})
    if not isinstance(transfer, dict):
        transfer = {}
    if "payer_id" not in transfer or "recipient_id" not in transfer:
        transfer_id = draft.payload.get("transfer_id")
        if transfer_id:
            try:
                transfer_obj = SettlementTransfer.objects.get(
                    pk=transfer_id,
                    settlement__trip_id=draft.trip_id,
                    settlement__status=SettlementStatus.FINALIZED,
                )
            except SettlementTransfer.DoesNotExist:
                return False
            transfer = {
                "payer_id": str(transfer_obj.payer_id),
                "recipient_id": str(transfer_obj.recipient_id),
            }
    if draft.required_confirmation == AI_CONFIRMATION_TRANSFER_PAYER:
        return str(transfer.get("payer_id")) == str(viewer.id)
    if draft.required_confirmation == AI_CONFIRMATION_TRANSFER_RECIPIENT:
        return str(transfer.get("recipient_id")) == str(viewer.id)
    return False


def can_confirm_action_draft(draft: AIActionDraft, *, viewer) -> bool:
    if draft.status != AIActionDraftStatus.READY:
        return False
    if draft.expires_at <= timezone.now():
        return False
    if draft.required_confirmation == AI_CONFIRMATION_CAPTAIN:
        return _is_active_captain(trip_id=draft.trip_id, user=viewer)
    if draft.required_confirmation == AI_CONFIRMATION_TIMELINE_ACTIVITY_STATUS:
        return can_update_timeline_activity_status(
            trip_id=draft.trip_id,
            activity_id=draft.payload.get("activity_id"),
            actor=viewer,
            status=draft.payload.get("status"),
        )
    return _can_confirm_transfer(draft, viewer)


def can_cancel_action_draft(draft: AIActionDraft, *, viewer) -> bool:
    if draft.status in FINAL_DRAFT_STATUSES:
        return False
    if viewer is None or not getattr(viewer, "is_authenticated", False):
        return False
    if str(draft.requested_by_id) == str(viewer.id):
        return True
    if draft.required_confirmation == AI_CONFIRMATION_CAPTAIN:
        return _is_active_captain(trip_id=draft.trip_id, user=viewer)
    return can_confirm_action_draft(draft, viewer=viewer)


def build_action_draft_payload(draft: AIActionDraft, *, viewer) -> dict:
    return {
        "id": str(draft.id),
        "action_type": draft.action_type,
        "status": draft.status,
        "required_confirmation": draft.required_confirmation,
        "can_confirm": can_confirm_action_draft(draft, viewer=viewer),
        "can_cancel": can_cancel_action_draft(draft, viewer=viewer),
        "preview": draft.preview,
        "missing_fields": normalize_missing_fields(draft.missing_fields, strict=False),
        "result": draft.result,
        "error_code": draft.error_code,
        "error_detail": draft.error_detail,
        "expires_at": draft.expires_at.isoformat(),
        "created_at": draft.created_at.isoformat(),
        "updated_at": draft.updated_at.isoformat(),
    }
