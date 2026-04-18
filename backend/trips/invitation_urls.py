from __future__ import annotations

from django.urls import path

from trips.views import AcceptInvitationAPIView, DeclineInvitationAPIView

urlpatterns = [
    path("<uuid:inv_id>/accept", AcceptInvitationAPIView.as_view(), name="accept"),
    path("<uuid:inv_id>/decline", DeclineInvitationAPIView.as_view(), name="decline"),
]
