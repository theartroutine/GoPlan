from __future__ import annotations

from django.urls import path

from trips.views import InvitableFriendsAPIView, TripDetailUpdateAPIView, TripInvitationsAPIView, TripListCreateAPIView

app_name = "trips"

urlpatterns = [
    path("", TripListCreateAPIView.as_view(), name="list-create"),
    path("/<uuid:trip_id>", TripDetailUpdateAPIView.as_view(), name="detail-update"),
    path("/<uuid:trip_id>/invitations", TripInvitationsAPIView.as_view(), name="invitations"),
    path("/<uuid:trip_id>/invitations/invitable-friends", InvitableFriendsAPIView.as_view(), name="invitable-friends"),
]
