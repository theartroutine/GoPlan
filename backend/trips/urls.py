from __future__ import annotations

from django.urls import path

from trips.views import (
    CancelTripAPIView,
    CompleteTripAPIView,
    InvitableFriendsAPIView,
    LeaveTripAPIView,
    RemoveMemberAPIView,
    StartTripAPIView,
    TimelineActivityDetailAPIView,
    TimelineActivityListCreateAPIView,
    TimelineActivityReorderAPIView,
    TimelineCustomTypeDetailAPIView,
    TimelineCustomTypeListCreateAPIView,
    TimelineSectionDetailAPIView,
    TimelineSectionListCreateAPIView,
    TimelineSectionReorderAPIView,
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
    path("<uuid:trip_id>/timeline/sections", TimelineSectionListCreateAPIView.as_view(), name="timeline-sections"),
    path("<uuid:trip_id>/timeline/sections/reorder", TimelineSectionReorderAPIView.as_view(), name="timeline-sections-reorder"),
    path("<uuid:trip_id>/timeline/sections/<uuid:section_id>", TimelineSectionDetailAPIView.as_view(), name="timeline-section-detail"),
    path("<uuid:trip_id>/timeline/sections/<uuid:section_id>/activities", TimelineActivityListCreateAPIView.as_view(), name="timeline-activities"),
    path("<uuid:trip_id>/timeline/sections/<uuid:section_id>/activities/reorder", TimelineActivityReorderAPIView.as_view(), name="timeline-activities-reorder"),
    path("<uuid:trip_id>/timeline/activities/<uuid:activity_id>", TimelineActivityDetailAPIView.as_view(), name="timeline-activity-detail"),
    path("<uuid:trip_id>/timeline/custom-types", TimelineCustomTypeListCreateAPIView.as_view(), name="timeline-custom-types"),
    path("<uuid:trip_id>/timeline/custom-types/<uuid:type_id>", TimelineCustomTypeDetailAPIView.as_view(), name="timeline-custom-type-detail"),
]
