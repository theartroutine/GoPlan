from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from expenses.serializers import (
    ContributionResponseSerializer,
    CreateExpenseSerializer,
    ExpenseResponseSerializer,
    SetContributionSerializer,
    SettlementTransferSerializer,
    TripSettlementSerializer,
    UpdateExpenseSerializer,
    serialize_dashboard_response,
    serialize_expense_detail_response,
)
from expenses.services import (
    ContributionUserNotParticipantError,
    ExpenseLockedError,
    ExpenseNotFoundError,
    ExpenseServiceError,
    NotTransferPayerError,
    NotTransferRecipientError,
    SettlementAlreadyFinalizedError,
    SettlementNotFinalizedError,
    SettlementUnderfundedError,
    TransferNotFoundError,
    build_expense_dashboard,
    build_expense_detail,
    confirm_transfer_received,
    create_expense,
    delete_expense,
    finalize_settlement,
    mark_transfer_sent,
    reopen_settlement,
    set_contribution,
    update_expense,
)
from trips.permissions import IsProfileCompleted
from trips.services import NotTripMemberError, TripNotFoundError, TripPermissionError, TripTerminalError

EXPENSE_PERMISSIONS = [permissions.IsAuthenticated, IsProfileCompleted]


def _service_error_response(exc, *, status_code: int, error_code: str | None = None):
    return Response(
        {"detail": str(exc), "error_code": error_code or exc.error_code},
        status=status_code,
    )


def _permission_error_response(exc):
    return _service_error_response(
        exc,
        status_code=status.HTTP_403_FORBIDDEN,
        error_code="NOT_CAPTAIN",
    )


class ExpenseListCreateAPIView(APIView):
    permission_classes = EXPENSE_PERMISSIONS
    throttle_scope = "expenses_list_create"

    def get(self, request, trip_id):
        try:
            dashboard = build_expense_dashboard(trip_id=trip_id, actor=request.user)
        except TripNotFoundError as exc:
            return _service_error_response(exc, status_code=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return _service_error_response(exc, status_code=status.HTTP_403_FORBIDDEN)

        return Response(serialize_dashboard_response(dashboard, request_user=request.user))

    def post(self, request, trip_id):
        serializer = CreateExpenseSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            expense = create_expense(
                trip_id=trip_id,
                actor=request.user,
                title=data["title"],
                description=data.get("description", ""),
                total_amount=data["total_amount"],
                collector_id=data.get("collector_id"),
            )
        except TripNotFoundError as exc:
            return _service_error_response(exc, status_code=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return _service_error_response(exc, status_code=status.HTTP_403_FORBIDDEN)
        except TripPermissionError as exc:
            return _permission_error_response(exc)
        except TripTerminalError as exc:
            return _service_error_response(exc, status_code=status.HTTP_409_CONFLICT)
        except SettlementAlreadyFinalizedError as exc:
            return _service_error_response(exc, status_code=status.HTTP_409_CONFLICT)
        except ExpenseServiceError as exc:
            return _service_error_response(exc, status_code=status.HTTP_400_BAD_REQUEST)

        return Response(ExpenseResponseSerializer(expense).data, status=status.HTTP_201_CREATED)


class ExpenseDetailAPIView(APIView):
    permission_classes = EXPENSE_PERMISSIONS
    throttle_scope = "expenses_detail"

    def get(self, request, trip_id, expense_id):
        try:
            detail = build_expense_detail(
                trip_id=trip_id,
                expense_id=expense_id,
                actor=request.user,
            )
        except (TripNotFoundError, ExpenseNotFoundError) as exc:
            return _service_error_response(exc, status_code=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return _service_error_response(exc, status_code=status.HTTP_403_FORBIDDEN)

        return Response(serialize_expense_detail_response(detail))

    def patch(self, request, trip_id, expense_id):
        serializer = UpdateExpenseSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            update_expense(
                trip_id=trip_id,
                expense_id=expense_id,
                actor=request.user,
                title=data.get("title"),
                description=data.get("description"),
                total_amount=data.get("total_amount"),
                collector_id=data.get("collector_id"),
                update_collector="collector_id" in data,
            )
            detail = build_expense_detail(
                trip_id=trip_id,
                expense_id=expense_id,
                actor=request.user,
            )
        except (TripNotFoundError, ExpenseNotFoundError) as exc:
            return _service_error_response(exc, status_code=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return _service_error_response(exc, status_code=status.HTTP_403_FORBIDDEN)
        except TripPermissionError as exc:
            return _permission_error_response(exc)
        except (ExpenseLockedError, TripTerminalError) as exc:
            return _service_error_response(exc, status_code=status.HTTP_409_CONFLICT)
        except ExpenseServiceError as exc:
            return _service_error_response(exc, status_code=status.HTTP_400_BAD_REQUEST)

        return Response(serialize_expense_detail_response(detail))

    def delete(self, request, trip_id, expense_id):
        try:
            delete_expense(
                trip_id=trip_id,
                expense_id=expense_id,
                actor=request.user,
            )
        except (TripNotFoundError, ExpenseNotFoundError) as exc:
            return _service_error_response(exc, status_code=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return _service_error_response(exc, status_code=status.HTTP_403_FORBIDDEN)
        except TripPermissionError as exc:
            return _permission_error_response(exc)
        except (ExpenseLockedError, TripTerminalError) as exc:
            return _service_error_response(exc, status_code=status.HTTP_409_CONFLICT)
        except ExpenseServiceError as exc:
            return _service_error_response(exc, status_code=status.HTTP_400_BAD_REQUEST)

        return Response(status=status.HTTP_204_NO_CONTENT)


class ExpenseContributionAPIView(APIView):
    permission_classes = EXPENSE_PERMISSIONS
    throttle_scope = "expenses_contributions"

    def patch(self, request, trip_id, expense_id, user_id):
        serializer = SetContributionSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        try:
            contribution = set_contribution(
                trip_id=trip_id,
                expense_id=expense_id,
                target_user_id=user_id,
                actor=request.user,
                amount=serializer.validated_data["amount"],
            )
        except (ExpenseNotFoundError, TripNotFoundError) as exc:
            return _service_error_response(exc, status_code=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return _service_error_response(exc, status_code=status.HTTP_403_FORBIDDEN)
        except TripPermissionError as exc:
            return _permission_error_response(exc)
        except ExpenseLockedError as exc:
            return _service_error_response(exc, status_code=status.HTTP_409_CONFLICT)
        except ContributionUserNotParticipantError as exc:
            return _service_error_response(exc, status_code=status.HTTP_409_CONFLICT)
        except ExpenseServiceError as exc:
            return _service_error_response(exc, status_code=status.HTTP_400_BAD_REQUEST)

        return Response(ContributionResponseSerializer(contribution).data)


class SettlementFinalizeAPIView(APIView):
    permission_classes = EXPENSE_PERMISSIONS
    throttle_scope = "settlement_finalize"

    def post(self, request, trip_id):
        try:
            settlement = finalize_settlement(trip_id=trip_id, actor=request.user)
        except TripNotFoundError as exc:
            return _service_error_response(exc, status_code=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return _service_error_response(exc, status_code=status.HTTP_403_FORBIDDEN)
        except TripPermissionError as exc:
            return _permission_error_response(exc)
        except SettlementAlreadyFinalizedError as exc:
            return _service_error_response(exc, status_code=status.HTTP_409_CONFLICT)
        except SettlementUnderfundedError as exc:
            return _service_error_response(exc, status_code=status.HTTP_409_CONFLICT)
        except ExpenseServiceError as exc:
            return _service_error_response(exc, status_code=status.HTTP_409_CONFLICT)

        return Response(TripSettlementSerializer(settlement).data)


class SettlementReopenAPIView(APIView):
    permission_classes = EXPENSE_PERMISSIONS
    throttle_scope = "settlement_reopen"

    def post(self, request, trip_id):
        try:
            settlement = reopen_settlement(trip_id=trip_id, actor=request.user)
        except TripNotFoundError as exc:
            return _service_error_response(exc, status_code=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return _service_error_response(exc, status_code=status.HTTP_403_FORBIDDEN)
        except TripPermissionError as exc:
            return _permission_error_response(exc)
        except SettlementNotFinalizedError as exc:
            return _service_error_response(exc, status_code=status.HTTP_409_CONFLICT)

        return Response(TripSettlementSerializer(settlement).data)


class SettlementTransferSentAPIView(APIView):
    permission_classes = EXPENSE_PERMISSIONS
    throttle_scope = "settlement_transfer_action"

    def post(self, request, trip_id, transfer_id):
        try:
            transfer = mark_transfer_sent(
                trip_id=trip_id,
                transfer_id=transfer_id,
                actor=request.user,
            )
        except (TripNotFoundError, TransferNotFoundError) as exc:
            return _service_error_response(exc, status_code=status.HTTP_404_NOT_FOUND)
        except (NotTripMemberError, NotTransferPayerError) as exc:
            return _service_error_response(exc, status_code=status.HTTP_403_FORBIDDEN)

        return Response(SettlementTransferSerializer(transfer).data)


class SettlementTransferReceivedAPIView(APIView):
    permission_classes = EXPENSE_PERMISSIONS
    throttle_scope = "settlement_transfer_action"

    def post(self, request, trip_id, transfer_id):
        try:
            transfer = confirm_transfer_received(
                trip_id=trip_id,
                transfer_id=transfer_id,
                actor=request.user,
            )
        except (TripNotFoundError, TransferNotFoundError) as exc:
            return _service_error_response(exc, status_code=status.HTTP_404_NOT_FOUND)
        except (NotTripMemberError, NotTransferRecipientError) as exc:
            return _service_error_response(exc, status_code=status.HTTP_403_FORBIDDEN)

        return Response(SettlementTransferSerializer(transfer).data)
