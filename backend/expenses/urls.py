from __future__ import annotations

from django.urls import path

from expenses.views import ExpenseContributionAPIView, ExpenseListCreateAPIView

app_name = "expenses"

urlpatterns = [
    path("<uuid:trip_id>/expenses", ExpenseListCreateAPIView.as_view(), name="list-create"),
    path(
        "<uuid:trip_id>/expenses/<uuid:expense_id>/contributions/<uuid:user_id>",
        ExpenseContributionAPIView.as_view(),
        name="contribution",
    ),
]
