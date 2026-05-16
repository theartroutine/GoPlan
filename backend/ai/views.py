from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework import serializers as drf_serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from ai.agent.drafts import build_action_draft_payload, can_cancel_action_draft
from ai.agent.draft_mutations import (
    AIActionDraftPatchFieldNotAllowedError,
    AIActionDraftTargetNotFoundError,
    patch_action_draft,
)
from ai.agent.executor import (
    AIActionDraftExpiredError,
    AIActionDraftForbiddenError,
    AIActionDraftNotReadyError,
    AIActionDraftStaleError,
    confirm_action_draft,
    mark_action_draft_failed,
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


def _error(
    detail: str,
    code: str,
    http_status: int,
    *,
    draft: AIActionDraft | None = None,
    viewer=None,
) -> Response:
    payload = {"detail": detail, "error_code": code}
    if draft is not None:
        payload["draft"] = build_action_draft_payload(draft, viewer=viewer)
    return Response(payload, status=http_status)


def _get_draft_or_404(*, trip_id, draft_id) -> AIActionDraft:
    try:
        return (
            AIActionDraft.objects
            .select_related("response_message", "requested_by")
            .get(pk=draft_id, trip_id=trip_id)
        )
    except AIActionDraft.DoesNotExist as exc:
        raise TripNotFoundError("Draft not found.") from exc


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

        patch_payload = serializer.validated_data.get("payload", {})
        try:
            draft = patch_action_draft(
                draft_id=draft_id,
                trip_id=trip_id,
                actor=request.user,
                patch_payload=patch_payload,
            )
        except AIActionDraft.DoesNotExist:
            return _error(
                "Draft not found.",
                "AI_DRAFT_NOT_FOUND",
                status.HTTP_404_NOT_FOUND,
            )
        except AIActionDraftExpiredError as exc:
            expired_draft = _get_draft_or_404(trip_id=trip_id, draft_id=draft_id)
            if expired_draft.response_message_id is not None:
                push_chat_message(expired_draft.response_message)
            return _error(
                str(exc),
                exc.error_code,
                status.HTTP_409_CONFLICT,
                draft=expired_draft,
                viewer=request.user,
            )
        except AIActionDraftForbiddenError as exc:
            return _error(str(exc), exc.error_code, status.HTTP_403_FORBIDDEN)
        except AIActionDraftNotReadyError as exc:
            return _error(str(exc), exc.error_code, status.HTTP_409_CONFLICT)
        except AIActionDraftPatchFieldNotAllowedError as exc:
            return _error(str(exc), exc.error_code, status.HTTP_400_BAD_REQUEST)
        except AIActionDraftTargetNotFoundError as exc:
            return _error(str(exc), exc.error_code, status.HTTP_400_BAD_REQUEST)

        if draft.response_message_id is not None:
            push_chat_message(draft.response_message)
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

        expired_draft = None
        with transaction.atomic():
            try:
                draft = (
                    AIActionDraft.objects
                    .select_for_update(of=("self",))
                    .select_related("response_message")
                    .get(pk=draft_id, trip_id=trip_id)
                )
            except AIActionDraft.DoesNotExist:
                return _error(
                    "Draft not found.",
                    "AI_DRAFT_NOT_FOUND",
                    status.HTTP_404_NOT_FOUND,
                )

            if (
                draft.status in {AIActionDraftStatus.NEEDS_INFO, AIActionDraftStatus.READY}
                and draft.expires_at <= timezone.now()
            ):
                draft.status = AIActionDraftStatus.EXPIRED
                draft.save(update_fields=["status", "updated_at"])
                if draft.response_message_id is not None:
                    draft.response_message.updated_at = timezone.now()
                    draft.response_message.save(update_fields=["updated_at"])
                expired_draft = draft
            elif draft.status in {
                AIActionDraftStatus.CONFIRMED,
                AIActionDraftStatus.CANCELLED,
                AIActionDraftStatus.EXPIRED,
                AIActionDraftStatus.FAILED,
            }:
                return Response({
                    "draft": build_action_draft_payload(draft, viewer=request.user)
                })
            elif not can_cancel_action_draft(draft, viewer=request.user):
                return _error(
                    "You cannot cancel this draft.",
                    "AI_DRAFT_FORBIDDEN",
                    status.HTTP_403_FORBIDDEN,
                )
            else:
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
                if draft.response_message_id is not None:
                    draft.response_message.updated_at = timezone.now()
                    draft.response_message.save(update_fields=["updated_at"])
                    transaction.on_commit(lambda: push_chat_message(draft.response_message))

        if expired_draft is not None:
            if expired_draft.response_message_id is not None:
                push_chat_message(expired_draft.response_message)
            return _error(
                "Draft expired.",
                "AI_DRAFT_EXPIRED",
                status.HTTP_409_CONFLICT,
                draft=expired_draft,
                viewer=request.user,
            )

        return Response({"draft": build_action_draft_payload(draft, viewer=request.user)})


def _confirm_error_response(
    exc: Exception,
    *,
    draft: AIActionDraft | None = None,
    viewer=None,
) -> Response | None:
    if isinstance(exc, AIActionDraftForbiddenError):
        return _error(
            str(exc),
            exc.error_code,
            status.HTTP_403_FORBIDDEN,
            draft=draft,
            viewer=viewer,
        )
    if isinstance(exc, AIActionDraftStaleError):
        return _error(
            str(exc),
            exc.error_code,
            status.HTTP_409_CONFLICT,
            draft=draft,
            viewer=viewer,
        )
    if isinstance(exc, (AIActionDraftExpiredError, AIActionDraftNotReadyError)):
        return _error(
            str(exc),
            exc.error_code,
            status.HTTP_409_CONFLICT,
            draft=draft,
            viewer=viewer,
        )
    if isinstance(
        exc,
        (
            ExpenseNotFoundError,
            TransferNotFoundError,
            TimelineActivityNotFoundError,
            TimelineSectionNotFoundError,
        ),
    ):
        return _error(
            str(exc),
            exc.error_code,
            status.HTTP_404_NOT_FOUND,
            draft=draft,
            viewer=viewer,
        )
    if isinstance(
        exc,
        (
            TripPermissionError,
            NotTripMemberError,
            NotTransferPayerError,
            NotTransferRecipientError,
        ),
    ):
        return _error(
            str(exc),
            exc.error_code,
            status.HTTP_403_FORBIDDEN,
            draft=draft,
            viewer=viewer,
        )
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
        return _error(
            str(exc),
            exc.error_code,
            status.HTTP_409_CONFLICT,
            draft=draft,
            viewer=viewer,
        )
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
        return _error(
            str(exc),
            exc.error_code,
            status.HTTP_400_BAD_REQUEST,
            draft=draft,
            viewer=viewer,
        )
    if isinstance(exc, drf_serializers.ValidationError):
        return _error(
            "Draft payload is invalid.",
            "AI_DRAFT_VALIDATION_FAILED",
            status.HTTP_400_BAD_REQUEST,
            draft=draft,
            viewer=viewer,
        )
    return None


def _should_persist_confirm_failure(exc: Exception) -> bool:
    return not isinstance(
        exc,
        (
            AIActionDraftForbiddenError,
            AIActionDraftExpiredError,
            AIActionDraftNotReadyError,
            AIActionDraft.DoesNotExist,
            TransferNotSentError,
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
            if isinstance(exc, AIActionDraftExpiredError):
                try:
                    expired_draft = _get_draft_or_404(
                        trip_id=trip_id,
                        draft_id=draft_id,
                    )
                except TripNotFoundError:
                    return _error(
                        "Draft not found.",
                        "AI_DRAFT_NOT_FOUND",
                        status.HTTP_404_NOT_FOUND,
                    )
                if expired_draft.response_message_id is not None:
                    push_chat_message(expired_draft.response_message)
                return _error(
                    str(exc),
                    exc.error_code,
                    status.HTTP_409_CONFLICT,
                    draft=expired_draft,
                    viewer=request.user,
                )
            failed_draft = _persist_confirm_failure(
                draft_id=draft_id,
                trip_id=trip_id,
                exc=exc,
            )
            if (
                failed_draft is not None
                and failed_draft.status == AIActionDraftStatus.FAILED
                and failed_draft.response_message_id is not None
            ):
                push_chat_message(failed_draft.response_message)
            error_draft = (
                failed_draft
                if failed_draft is not None
                and failed_draft.status == AIActionDraftStatus.FAILED
                else None
            )
            mapped = _confirm_error_response(
                exc,
                draft=error_draft,
                viewer=request.user,
            )
            if mapped is not None:
                return mapped
            return _error(
                "Draft execution failed.",
                "AI_DRAFT_EXECUTION_FAILED",
                status.HTTP_409_CONFLICT,
                draft=error_draft,
                viewer=request.user,
            )

        if draft.response_message_id is not None:
            push_chat_message(draft.response_message)
        return Response({"draft": build_action_draft_payload(draft, viewer=request.user)})
