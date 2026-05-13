from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework import serializers as drf_serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from ai.agent.drafts import build_action_draft_payload, can_cancel_action_draft
from ai.agent.draft_fields import (
    build_missing_fields,
    normalize_missing_field_names,
)
from ai.agent.executor import (
    AIActionDraftExpiredError,
    AIActionDraftForbiddenError,
    AIActionDraftNotReadyError,
    AIActionDraftStaleError,
    confirm_action_draft,
    mark_action_draft_failed,
)
from ai.agent.payload_validation import (
    TIMELINE_ACTIVITY_DATA_FIELDS,
    missing_payload_field_names,
)
from ai.agent.preview import build_action_preview
from ai.action_types import (
    AI_ACTION_TIMELINE_ACTIVITY_CREATE,
    AI_ACTION_TIMELINE_ACTIVITY_UPDATE,
)
from ai.models import AIActionDraft, AIActionDraftStatus
from ai.serializers import AIActionDraftPatchSerializer
from chat.services import ensure_user_can_access_trip_chat, push_chat_message
from expenses.services import (
    CollectorNotParticipantError,
    ContributionUserNotParticipantError,
    ExpenseLockedError,
    ExpenseNotFoundError,
    ExpenseServiceError,
    NotTransferPayerError,
    NotTransferRecipientError,
    SettlementAlreadyFinalizedError,
    SettlementEmptyError,
    SettlementNotFinalizedError,
    SettlementUnderfundedError,
    TransferNotFoundError,
    TransferNotSentError,
)
from trips.permissions import IsProfileCompleted
from trips.services import (
    NotTripMemberError,
    StatusTransitionError,
    TimelineActivityNotFoundError,
    TimelineInvalidAssigneeError,
    TimelineInvalidCustomTypeError,
    TimelineSectionNotFoundError,
    TripNotFoundError,
    TripPermissionError,
    TripTerminalError,
)

AI_PERMISSIONS = [permissions.IsAuthenticated, IsProfileCompleted]


def _error(detail: str, code: str, http_status: int) -> Response:
    return Response({"detail": detail, "error_code": code}, status=http_status)


def _get_draft_or_404(*, trip_id, draft_id) -> AIActionDraft:
    try:
        return (
            AIActionDraft.objects
            .select_related("response_message", "requested_by")
            .get(pk=draft_id, trip_id=trip_id)
        )
    except AIActionDraft.DoesNotExist as exc:
        raise TripNotFoundError("Draft not found.") from exc


def _apply_draft_patch_payload(draft: AIActionDraft, patch_payload: dict) -> dict:
    next_payload = dict(draft.payload)
    if draft.action_type in {
        AI_ACTION_TIMELINE_ACTIVITY_CREATE,
        AI_ACTION_TIMELINE_ACTIVITY_UPDATE,
    }:
        data = dict(next_payload.get("data") or {})
        for key, value in patch_payload.items():
            if key in TIMELINE_ACTIVITY_DATA_FIELDS:
                data[key] = value
            else:
                next_payload[key] = value
        next_payload["data"] = data
        return next_payload
    return {**next_payload, **patch_payload}


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


class AIActionDraftDetailAPIView(APIView):
    permission_classes = AI_PERMISSIONS
    throttle_scope = "ai_action_draft"

    def get(self, request, trip_id, draft_id):
        try:
            ensure_user_can_access_trip_chat(request.user, trip_id)
            draft = _get_draft_or_404(trip_id=trip_id, draft_id=draft_id)
        except TripNotFoundError:
            return _error(
                "Draft not found.",
                "AI_DRAFT_NOT_FOUND",
                status.HTTP_404_NOT_FOUND,
            )
        return Response({"draft": build_action_draft_payload(draft, viewer=request.user)})

    def patch(self, request, trip_id, draft_id):
        serializer = AIActionDraftPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            ensure_user_can_access_trip_chat(request.user, trip_id)
        except TripNotFoundError:
            return _error(
                "Draft not found.",
                "AI_DRAFT_NOT_FOUND",
                status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            try:
                draft = (
                    AIActionDraft.objects
                    .select_for_update()
                    .select_related("response_message")
                    .get(pk=draft_id, trip_id=trip_id)
                )
            except AIActionDraft.DoesNotExist:
                return _error(
                    "Draft not found.",
                    "AI_DRAFT_NOT_FOUND",
                    status.HTTP_404_NOT_FOUND,
                )

            draft_payload = build_action_draft_payload(draft, viewer=request.user)
            can_edit = (
                str(draft.requested_by_id) == str(request.user.id)
                or draft_payload["can_confirm"]
                or draft_payload["can_cancel"]
            )
            if not can_edit:
                return _error(
                    "You cannot update this draft.",
                    "AI_DRAFT_FORBIDDEN",
                    status.HTTP_403_FORBIDDEN,
                )
            if draft.status != AIActionDraftStatus.NEEDS_INFO:
                return _error(
                    "Draft is not waiting for more information.",
                    "AI_DRAFT_NOT_READY",
                    status.HTTP_409_CONFLICT,
                )

            next_payload = _apply_draft_patch_payload(
                draft,
                serializer.validated_data.get("payload", {}),
            )
            still_missing = _refresh_missing_fields(draft, next_payload)
            draft.payload = next_payload
            draft.preview = build_action_preview(
                action_type=draft.action_type,
                payload=next_payload,
            )
            draft.missing_fields = still_missing
            if not still_missing:
                draft.status = AIActionDraftStatus.READY
            draft.save(
                update_fields=[
                    "payload",
                    "preview",
                    "missing_fields",
                    "status",
                    "updated_at",
                ]
            )
            draft.response_message.updated_at = timezone.now()
            draft.response_message.save(update_fields=["updated_at"])
            transaction.on_commit(lambda: push_chat_message(draft.response_message))

        return Response({"draft": build_action_draft_payload(draft, viewer=request.user)})


class AIActionDraftCancelAPIView(APIView):
    permission_classes = AI_PERMISSIONS
    throttle_scope = "ai_action_draft"

    def post(self, request, trip_id, draft_id):
        try:
            ensure_user_can_access_trip_chat(request.user, trip_id)
        except TripNotFoundError:
            return _error(
                "Draft not found.",
                "AI_DRAFT_NOT_FOUND",
                status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            try:
                draft = (
                    AIActionDraft.objects
                    .select_for_update()
                    .select_related("response_message")
                    .get(pk=draft_id, trip_id=trip_id)
                )
            except AIActionDraft.DoesNotExist:
                return _error(
                    "Draft not found.",
                    "AI_DRAFT_NOT_FOUND",
                    status.HTTP_404_NOT_FOUND,
                )

            if draft.status in {
                AIActionDraftStatus.CONFIRMED,
                AIActionDraftStatus.CANCELLED,
                AIActionDraftStatus.EXPIRED,
                AIActionDraftStatus.FAILED,
            }:
                return Response({
                    "draft": build_action_draft_payload(draft, viewer=request.user)
                })

            if not can_cancel_action_draft(draft, viewer=request.user):
                return _error(
                    "You cannot cancel this draft.",
                    "AI_DRAFT_FORBIDDEN",
                    status.HTTP_403_FORBIDDEN,
                )

            draft.status = AIActionDraftStatus.CANCELLED
            draft.cancelled_by = request.user
            draft.cancelled_at = timezone.now()
            draft.save(
                update_fields=[
                    "status",
                    "cancelled_by",
                    "cancelled_at",
                    "updated_at",
                ]
            )
            draft.response_message.updated_at = timezone.now()
            draft.response_message.save(update_fields=["updated_at"])
            transaction.on_commit(lambda: push_chat_message(draft.response_message))

        return Response({"draft": build_action_draft_payload(draft, viewer=request.user)})


def _confirm_error_response(exc: Exception) -> Response | None:
    if isinstance(exc, AIActionDraftForbiddenError):
        return _error(str(exc), exc.error_code, status.HTTP_403_FORBIDDEN)
    if isinstance(exc, AIActionDraftStaleError):
        return _error(str(exc), exc.error_code, status.HTTP_409_CONFLICT)
    if isinstance(exc, (AIActionDraftExpiredError, AIActionDraftNotReadyError)):
        return _error(str(exc), exc.error_code, status.HTTP_409_CONFLICT)
    if isinstance(
        exc,
        (
            ExpenseNotFoundError,
            TransferNotFoundError,
            TimelineActivityNotFoundError,
            TimelineSectionNotFoundError,
        ),
    ):
        return _error(str(exc), exc.error_code, status.HTTP_404_NOT_FOUND)
    if isinstance(
        exc,
        (
            TripPermissionError,
            NotTripMemberError,
            NotTransferPayerError,
            NotTransferRecipientError,
        ),
    ):
        return _error(str(exc), exc.error_code, status.HTTP_403_FORBIDDEN)
    if isinstance(
        exc,
        (
            ExpenseLockedError,
            SettlementAlreadyFinalizedError,
            SettlementNotFinalizedError,
            SettlementUnderfundedError,
            SettlementEmptyError,
            TransferNotSentError,
            TripTerminalError,
            StatusTransitionError,
        ),
    ):
        return _error(str(exc), exc.error_code, status.HTTP_409_CONFLICT)
    if isinstance(
        exc,
        (
            CollectorNotParticipantError,
            ContributionUserNotParticipantError,
            ExpenseServiceError,
            TimelineInvalidAssigneeError,
            TimelineInvalidCustomTypeError,
        ),
    ):
        return _error(str(exc), exc.error_code, status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, drf_serializers.ValidationError):
        return _error(
            "Draft payload is invalid.",
            "AI_DRAFT_VALIDATION_FAILED",
            status.HTTP_400_BAD_REQUEST,
        )
    return None


def _should_persist_confirm_failure(exc: Exception) -> bool:
    return not isinstance(
        exc,
        (
            AIActionDraftForbiddenError,
            AIActionDraftExpiredError,
            AIActionDraft.DoesNotExist,
        ),
    )


def _confirm_failure_error_code(exc: Exception) -> str:
    if isinstance(exc, drf_serializers.ValidationError):
        return "AI_DRAFT_VALIDATION_FAILED"
    return str(getattr(exc, "error_code", "") or "AI_DRAFT_EXECUTION_FAILED")


def _persist_confirm_failure(*, draft_id, trip_id, exc: Exception) -> AIActionDraft | None:
    if not _should_persist_confirm_failure(exc):
        return None
    return mark_action_draft_failed(
        draft_id=draft_id,
        trip_id=trip_id,
        error_code=_confirm_failure_error_code(exc),
        error_detail=str(exc) or "Draft execution failed.",
    )


class AIActionDraftConfirmAPIView(APIView):
    permission_classes = AI_PERMISSIONS
    throttle_scope = "ai_action_confirm"

    def post(self, request, trip_id, draft_id):
        try:
            ensure_user_can_access_trip_chat(request.user, trip_id)
            draft = confirm_action_draft(
                draft_id=draft_id,
                trip_id=trip_id,
                actor=request.user,
            )
        except TripNotFoundError:
            return _error(
                "Draft not found.",
                "AI_DRAFT_NOT_FOUND",
                status.HTTP_404_NOT_FOUND,
            )
        except AIActionDraft.DoesNotExist:
            return _error(
                "Draft not found.",
                "AI_DRAFT_NOT_FOUND",
                status.HTTP_404_NOT_FOUND,
            )
        except Exception as exc:
            failed_draft = _persist_confirm_failure(
                draft_id=draft_id,
                trip_id=trip_id,
                exc=exc,
            )
            if (
                failed_draft is not None
                and failed_draft.status == AIActionDraftStatus.FAILED
            ):
                push_chat_message(failed_draft.response_message)
            mapped = _confirm_error_response(exc)
            if mapped is not None:
                return mapped
            return _error(
                "Draft execution failed.",
                "AI_DRAFT_EXECUTION_FAILED",
                status.HTTP_409_CONFLICT,
            )

        push_chat_message(draft.response_message)
        return Response({"draft": build_action_draft_payload(draft, viewer=request.user)})
