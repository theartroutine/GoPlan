from __future__ import annotations

from django.urls import path

from expenses.views import (
    ExpenseContributionAPIView,
    ExpenseDetailAPIView,
    ExpenseListCreateAPIView,
    SettlementFinalizeAPIView,
    SettlementReopenAPIView,
    SettlementTransferReceivedAPIView,
    SettlementTransferSentAPIView,
)

app_name = "expenses"

urlpatterns = [
    path(
        "<uuid:trip_id>/settlement/finalize",
        SettlementFinalizeAPIView.as_view(),
        name="settlement-finalize",
    ),
    path(
        "<uuid:trip_id>/settlement/reopen",
        SettlementReopenAPIView.as_view(),
        name="settlement-reopen",
    ),
    path(
        "<uuid:trip_id>/settlement/transfers/<uuid:transfer_id>/sent",
        SettlementTransferSentAPIView.as_view(),
        name="settlement-transfer-sent",
    ),
    path(
        "<uuid:trip_id>/settlement/transfers/<uuid:transfer_id>/received",
        SettlementTransferReceivedAPIView.as_view(),
        name="settlement-transfer-received",
    ),
    path("<uuid:trip_id>/expenses", ExpenseListCreateAPIView.as_view(), name="list-create"),
    path(
        "<uuid:trip_id>/expenses/<uuid:expense_id>",
        ExpenseDetailAPIView.as_view(),
        name="detail",
    ),
    path(
        "<uuid:trip_id>/expenses/<uuid:expense_id>/contributions/<uuid:user_id>",
        ExpenseContributionAPIView.as_view(),
        name="contribution",
    ),
]
