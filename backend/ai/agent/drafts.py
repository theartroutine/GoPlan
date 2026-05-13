from __future__ import annotations

from django.core.exceptions import ValidationError
from django.utils import timezone

from ai.action_types import (
    AI_ACTION_SETTLEMENT_TRANSFER_CONFIRM_RECEIVED,
    AI_CONFIRMATION_CAPTAIN,
    AI_CONFIRMATION_TIMELINE_ACTIVITY_STATUS,
    AI_CONFIRMATION_TRANSFER_PAYER,
    AI_CONFIRMATION_TRANSFER_RECIPIENT,
)
from ai.agent.draft_fields import normalize_missing_fields
from ai.models import AIActionDraft, AIActionDraftStatus
from expenses.models import SettlementStatus, SettlementTransfer
from trips.models import (
    MemberStatus,
    TimelineActivityStatus,
    TimelineActivityTimeMode,
    TimelineCustomType,
    TimelineLocationMode,
    TimelineSection,
    TimelineSystemType,
    TripMember,
    TripRole,
)
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
    transfer_obj = None
    transfer_id = draft.payload.get("transfer_id")
    should_lookup_transfer = bool(transfer_id)
    if should_lookup_transfer and transfer_id:
        try:
            transfer_obj = SettlementTransfer.objects.get(
                pk=transfer_id,
                settlement__trip_id=draft.trip_id,
                settlement__status=SettlementStatus.FINALIZED,
            )
        except (
            SettlementTransfer.DoesNotExist,
            TypeError,
            ValueError,
            ValidationError,
        ):
            return False
        transfer = {
            "payer_id": str(transfer_obj.payer_id),
            "recipient_id": str(transfer_obj.recipient_id),
        }
    if draft.required_confirmation == AI_CONFIRMATION_TRANSFER_PAYER:
        return str(transfer.get("payer_id")) == str(viewer.id)
    if draft.required_confirmation == AI_CONFIRMATION_TRANSFER_RECIPIENT:
        if (
            draft.action_type == AI_ACTION_SETTLEMENT_TRANSFER_CONFIRM_RECEIVED
            and transfer_obj is not None
            and transfer_obj.payer_marked_sent_at is None
        ):
            return False
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


def _choice_options(choices) -> list[dict]:
    return [
        {"value": value, "label": str(label)}
        for value, label in choices
    ]


STATIC_FIELD_OPTIONS = {
    "status": _choice_options(TimelineActivityStatus.choices),
    "time_mode": _choice_options(TimelineActivityTimeMode.choices),
    "location_mode": _choice_options(TimelineLocationMode.choices),
    "system_type": _choice_options(TimelineSystemType.choices),
}


def _member_label(member: TripMember) -> str:
    user = member.user
    display_name = user.display_name or user.email
    if user.identify_tag:
        return f"{display_name} ({user.identify_tag})"
    return display_name


def _active_member_options(*, trip_id) -> list[dict]:
    return [
        {"value": str(member.user_id), "label": _member_label(member)}
        for member in (
            TripMember.objects
            .select_related("user")
            .filter(trip_id=trip_id, status=MemberStatus.ACTIVE)
            .order_by("role", "created_at")
        )
    ]


def _timeline_section_options(*, trip_id) -> list[dict]:
    return [
        {
            "value": str(section.id),
            "label": f"{section.label} ({section.section_date.isoformat()})",
        }
        for section in TimelineSection.objects.filter(trip_id=trip_id)
    ]


def _transfer_label(transfer: SettlementTransfer) -> str:
    return (
        f"{transfer.payer.display_name} -> "
        f"{transfer.recipient.display_name}: {transfer.amount}"
    )


def _settlement_transfer_options(*, trip_id) -> list[dict]:
    return [
        {"value": str(transfer.id), "label": _transfer_label(transfer)}
        for transfer in (
            SettlementTransfer.objects
            .select_related("payer", "recipient")
            .filter(
                settlement__trip_id=trip_id,
                settlement__status=SettlementStatus.FINALIZED,
            )
        )
    ]


def _custom_type_options(*, trip_id) -> list[dict]:
    return [
        {"value": str(custom_type.id), "label": custom_type.name}
        for custom_type in TimelineCustomType.objects.filter(
            trip_id=trip_id,
            is_active=True,
        )
    ]


def _enrich_missing_field(field: dict, *, draft: AIActionDraft) -> dict:
    enriched = dict(field)
    name = enriched.get("name")
    if name in STATIC_FIELD_OPTIONS:
        enriched["type"] = "select"
        enriched["options"] = STATIC_FIELD_OPTIONS[name]
        return enriched
    if name == "section_id":
        enriched["type"] = "select"
        enriched["options"] = _timeline_section_options(trip_id=draft.trip_id)
        return enriched
    if name in {"user_id", "collector_id", "payer_id", "assignee_user_id"}:
        enriched["type"] = "select"
        enriched["options"] = _active_member_options(trip_id=draft.trip_id)
        return enriched
    if name == "transfer_id":
        enriched["type"] = "select"
        enriched["options"] = _settlement_transfer_options(trip_id=draft.trip_id)
        return enriched
    if name == "custom_type_id":
        enriched["type"] = "select"
        enriched["options"] = _custom_type_options(trip_id=draft.trip_id)
        return enriched
    if name in {"data", "place"}:
        enriched["type"] = "json"
        return enriched
    return enriched


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
    missing_fields = [
        _enrich_missing_field(field, draft=draft)
        for field in normalize_missing_fields(draft.missing_fields, strict=False)
    ]
    return {
        "id": str(draft.id),
        "action_type": draft.action_type,
        "status": draft.status,
        "required_confirmation": draft.required_confirmation,
        "can_confirm": can_confirm_action_draft(draft, viewer=viewer),
        "can_cancel": can_cancel_action_draft(draft, viewer=viewer),
        "preview": draft.preview,
        "missing_fields": missing_fields,
        "result": draft.result,
        "error_code": draft.error_code,
        "error_detail": draft.error_detail,
        "expires_at": draft.expires_at.isoformat(),
        "created_at": draft.created_at.isoformat(),
        "updated_at": draft.updated_at.isoformat(),
    }
