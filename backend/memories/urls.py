from __future__ import annotations

from django.urls import path

from memories.views import (
    PublicTripMemoryVideoAssetAPIView,
    PublicTripMemoryVideoDetailAPIView,
    TripMemoryMusicTracksAPIView,
    TripMemoryVideoCreateOptionsAPIView,
    TripMemoryVideoAssetAPIView,
    TripMemoryVideoDetailAPIView,
    TripMemoryVideoListCreateAPIView,
    TripMemoryVideoShareLinkAPIView,
    TripMemoryVideoStatusAPIView,
    TripPhotoAssetAPIView,
    TripPhotoBulkDownloadAPIView,
    TripPhotoDetailAPIView,
    TripPhotoListCreateAPIView,
)

app_name = "memories"

urlpatterns = [
    path("<uuid:trip_id>/photos", TripPhotoListCreateAPIView.as_view(), name="trip-photos"),
    path("<uuid:trip_id>/photos/download", TripPhotoBulkDownloadAPIView.as_view(), name="trip-photos-download"),
    path("<uuid:trip_id>/photos/<uuid:photo_id>", TripPhotoDetailAPIView.as_view(), name="trip-photo-detail"),
    path("<uuid:trip_id>/photos/<uuid:photo_id>/<str:variant>", TripPhotoAssetAPIView.as_view(), name="trip-photo-asset"),
    path("<uuid:trip_id>/memories", TripMemoryVideoListCreateAPIView.as_view(), name="trip-memories"),
    path("<uuid:trip_id>/memories/status", TripMemoryVideoStatusAPIView.as_view(), name="trip-memory-status"),
    path("<uuid:trip_id>/memories/create-options", TripMemoryVideoCreateOptionsAPIView.as_view(), name="trip-memory-create-options"),
    path("<uuid:trip_id>/memories/music-tracks", TripMemoryMusicTracksAPIView.as_view(), name="trip-memory-music-tracks"),
    path("<uuid:trip_id>/memories/<uuid:memory_id>", TripMemoryVideoDetailAPIView.as_view(), name="trip-memory-detail"),
    path(
        "<uuid:trip_id>/memories/<uuid:memory_id>/share-link",
        TripMemoryVideoShareLinkAPIView.as_view(),
        name="trip-memory-share-link",
    ),
    path("<uuid:trip_id>/memories/<uuid:memory_id>/<str:variant>", TripMemoryVideoAssetAPIView.as_view(), name="trip-memory-asset"),
]

public_urlpatterns = [
    path("<str:share_slug>", PublicTripMemoryVideoDetailAPIView.as_view(), name="public-memory-detail"),
    path("<str:share_slug>/<str:variant>", PublicTripMemoryVideoAssetAPIView.as_view(), name="public-memory-asset"),
]
