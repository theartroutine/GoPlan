from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from ai.action_types import (
    AI_ACTION_TIMELINE_ACTIVITY_CREATE,
    AI_ACTION_TIMELINE_ACTIVITY_UPDATE,
)
from ai.agent.draft_fields import (
    build_missing_fields,
    normalize_missing_field_names,
)
from ai.agent.drafts import (
    can_edit_action_draft,
)
from ai.agent.executor import (
    AIActionDraftExpiredError,
    AIActionDraftForbiddenError,
    AIActionDraftNotReadyError,
)
from ai.agent.payload_validation import (
    TIMELINE_ACTIVITY_DATA_FIELDS,
    missing_payload_field_names,
)
from ai.agent.preconditions import (
    action_requires_stale_precondition,
    build_backend_preconditions,
)
from ai.agent.preview import build_action_preview
from ai.models import AIActionDraft, AIActionDraftStatus


class AIActionDraftPatchFieldNotAllowedError(Exception):
    error_code = "AI_DRAFT_PATCH_FIELD_NOT_ALLOWED"

    def __init__(self, fields: list[str]) -> None:
        self.fields = fields
        super().__init__(
            "Only fields currently requested by this draft can be updated. "
            f"Unsupported field(s): {', '.join(fields)}."
        )


class AIActionDraftTargetNotFoundError(Exception):
    error_code = "AI_DRAFT_TARGET_NOT_FOUND"


def _apply_draft_patch_payload(draft: AIActionDraft, patch_payload: dict) -> dict:
    next_payload = dict(draft.payload)
    if draft.action_type in {
        AI_ACTION_TIMELINE_ACTIVITY_CREATE,
        AI_ACTION_TIMELINE_ACTIVITY_UPDATE,
    }:
        data = dict(next_payload.get("data") or {})
        data_overridden = False
        for key, value in patch_payload.items():
            if key == "data":
                if isinstance(value, dict):
                    data.update(value)
                else:
                    next_payload["data"] = value
                    data_overridden = True
            elif key in TIMELINE_ACTIVITY_DATA_FIELDS:
                data[key] = value
            else:
                next_payload[key] = value
        if not data_overridden:
            next_payload["data"] = data
        return next_payload
    return {**next_payload, **patch_payload}


def _disallowed_patch_fields(draft: AIActionDraft, patch_payload: dict) -> list[str]:
    allowed_fields = set(
        normalize_missing_field_names(
            draft.missing_fields,
            strict=False,
        )
    )
    allowed_fields.difference_update({"activity_id", "expense_id"})
    return sorted(
        field_name
        for field_name in patch_payload.keys()
        if field_name not in allowed_fields
    )


def _refresh_missing_fields(draft: AIActionDraft, payload: dict) -> list[dict]:
    current_missing_names = normalize_missing_field_names(
        draft.missing_fields,
        strict=False,
    )
    missing_names = missing_payload_field_names(
        action_type=draft.action_type,
        payload=payload,
        provider_missing_names=current_missing_names,
    )
    return build_missing_fields(missing_names)


def _touch_response_message(draft: AIActionDraft) -> None:
    draft.response_message.updated_at = timezone.now()
    draft.response_message.save(update_fields=["updated_at"])


def _expire_draft(draft: AIActionDraft) -> None:
    draft.status = AIActionDraftStatus.EXPIRED
    draft.save(update_fields=["status", "updated_at"])
    _touch_response_message(draft)


def patch_action_draft(
    *,
    draft_id,
    trip_id,
    actor,
    patch_payload: dict,
) -> AIActionDraft:
    expired = False
    with transaction.atomic():
        draft = (
            AIActionDraft.objects
            .select_for_update()
            .select_related("response_message")
            .get(pk=draft_id, trip_id=trip_id)
        )

        if (
            draft.status in {AIActionDraftStatus.NEEDS_INFO, AIActionDraftStatus.READY}
            and draft.expires_at <= timezone.now()
        ):
            _expire_draft(draft)
            expired = True
        elif draft.status != AIActionDraftStatus.NEEDS_INFO:
            raise AIActionDraftNotReadyError(
                "Draft is not waiting for more information."
            )
        else:
            if not can_edit_action_draft(draft, viewer=actor):
                raise AIActionDraftForbiddenError("You cannot update this draft.")

            disallowed_fields = _disallowed_patch_fields(draft, patch_payload)
            if disallowed_fields:
                raise AIActionDraftPatchFieldNotAllowedError(disallowed_fields)

            next_payload = _apply_draft_patch_payload(
                draft,
                patch_payload,
            )
            still_missing = _refresh_missing_fields(draft, next_payload)
            try:
                next_preconditions = (
                    build_backend_preconditions(
                        action_type=draft.action_type,
                        trip_id=draft.trip_id,
                        payload=next_payload,
                        required=not still_missing,
                    )
                    if action_requires_stale_precondition(draft.action_type)
                    else {}
                )
            except ValueError as exc:
                raise AIActionDraftTargetNotFoundError(
                    "Draft target could not be resolved."
                ) from exc
            draft.payload = next_payload
            draft.preview = build_action_preview(
                action_type=draft.action_type,
                payload=next_payload,
            )
            draft.missing_fields = still_missing
            draft.preconditions = next_preconditions
            if not still_missing:
                draft.status = AIActionDraftStatus.READY
            draft.save(
                update_fields=[
                    "payload",
                    "preview",
                    "missing_fields",
                    "preconditions",
                    "status",
                    "updated_at",
                ]
            )
            _touch_response_message(draft)

    if expired:
        raise AIActionDraftExpiredError("Draft expired.")
    return draft
