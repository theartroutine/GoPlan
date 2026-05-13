from __future__ import annotations

from django.urls import path

from ai.views import (
    AIActionDraftCancelAPIView,
    AIActionDraftConfirmAPIView,
    AIActionDraftDetailAPIView,
)

app_name = "ai"

urlpatterns = [
    path(
        "action-drafts/<uuid:draft_id>",
        AIActionDraftDetailAPIView.as_view(),
        name="action-draft-detail",
    ),
    path(
        "action-drafts/<uuid:draft_id>/cancel",
        AIActionDraftCancelAPIView.as_view(),
        name="action-draft-cancel",
    ),
    path(
        "action-drafts/<uuid:draft_id>/confirm",
        AIActionDraftConfirmAPIView.as_view(),
        name="action-draft-confirm",
    ),
]
