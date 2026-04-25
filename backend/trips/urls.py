from __future__ import annotations

from django.urls import path

from trips.views import (
    CancelTripAPIView,
    CompleteTripAPIView,
    InvitableFriendsAPIView,
    LeaveTripAPIView,
    RemoveMemberAPIView,
    StartTripAPIView,
    TripDetailUpdateAPIView,
    TripInvitationsAPIView,
    TripListCreateAPIView,
    TripTimelineAPIView,
)

app_name = "trips"

urlpatterns = [
    path("", TripListCreateAPIView.as_view(), name="list-create"),
    path("<uuid:trip_id>", TripDetailUpdateAPIView.as_view(), name="detail-update"),
    path("<uuid:trip_id>/invitations", TripInvitationsAPIView.as_view(), name="invitations"),
    path("<uuid:trip_id>/invitations/invitable-friends", InvitableFriendsAPIView.as_view(), name="invitable-friends"),
    path("<uuid:trip_id>/start", StartTripAPIView.as_view(), name="trip-start"),
    path("<uuid:trip_id>/complete", CompleteTripAPIView.as_view(), name="trip-complete"),
    path("<uuid:trip_id>/cancel", CancelTripAPIView.as_view(), name="trip-cancel"),
    path("<uuid:trip_id>/members/<uuid:user_id>", RemoveMemberAPIView.as_view(), name="trip-remove-member"),
    path("<uuid:trip_id>/leave", LeaveTripAPIView.as_view(), name="trip-leave"),
    path("<uuid:trip_id>/timeline", TripTimelineAPIView.as_view(), name="trip-timeline"),
]
