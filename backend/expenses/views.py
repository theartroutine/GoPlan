from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from expenses.serializers import (
    ContributionResponseSerializer,
    CreateExpenseSerializer,
    ExpenseResponseSerializer,
    SetContributionSerializer,
    serialize_dashboard_response,
)
from expenses.services import (
    ContributionUserNotParticipantError,
    ExpenseLockedError,
    ExpenseNotFoundError,
    ExpenseServiceError,
    build_expense_dashboard,
    create_expense,
    set_contribution,
)
from trips.permissions import IsProfileCompleted
from trips.services import NotTripMemberError, TripNotFoundError, TripPermissionError, TripTerminalError

User = get_user_model()
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

        collector = None
        if "collector_id" in data:
            try:
                collector = User.objects.get(pk=data["collector_id"])
            except User.DoesNotExist:
                error = ExpenseServiceError("Collector must be an active trip member.")
                return _service_error_response(error, status_code=status.HTTP_400_BAD_REQUEST)

        try:
            expense = create_expense(
                trip_id=trip_id,
                actor=request.user,
                title=data["title"],
                description=data.get("description", ""),
                total_amount=data["total_amount"],
                collector=collector,
            )
        except TripNotFoundError as exc:
            return _service_error_response(exc, status_code=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return _service_error_response(exc, status_code=status.HTTP_403_FORBIDDEN)
        except TripPermissionError as exc:
            return _permission_error_response(exc)
        except TripTerminalError as exc:
            return _service_error_response(exc, status_code=status.HTTP_409_CONFLICT)
        except ExpenseServiceError as exc:
            return _service_error_response(exc, status_code=status.HTTP_400_BAD_REQUEST)

        return Response(ExpenseResponseSerializer(expense).data, status=status.HTTP_201_CREATED)


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
