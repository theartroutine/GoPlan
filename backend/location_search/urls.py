from __future__ import annotations

from django.urls import path

from location_search.views import (
    LocationSearchLookupAPIView,
    LocationSearchSuggestAPIView,
)

app_name = "location_search"

urlpatterns = [
    path(
        "suggest",
        LocationSearchSuggestAPIView.as_view(),
        name="suggest",
    ),
    path(
        "lookup",
        LocationSearchLookupAPIView.as_view(),
        name="lookup",
    ),
]
