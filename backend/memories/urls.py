from __future__ import annotations

from django.urls import path

from memories.views import (
    TripPhotoAssetAPIView,
    TripPhotoDetailAPIView,
    TripPhotoListCreateAPIView,
)

app_name = "memories"

urlpatterns = [
    path("<uuid:trip_id>/photos", TripPhotoListCreateAPIView.as_view(), name="trip-photos"),
    path("<uuid:trip_id>/photos/<uuid:photo_id>", TripPhotoDetailAPIView.as_view(), name="trip-photo-detail"),
    path("<uuid:trip_id>/photos/<uuid:photo_id>/<str:variant>", TripPhotoAssetAPIView.as_view(), name="trip-photo-asset"),
]
