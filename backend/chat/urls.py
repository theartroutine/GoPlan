from __future__ import annotations

from django.urls import path

from chat.views import (
    ChatMessageDeletionAPIView,
    ChatMessagesBulkHideAPIView,
    MessageReactionAPIView,
    TripChatMessagesAPIView,
)

app_name = "chat"

urlpatterns = [
    path("messages", TripChatMessagesAPIView.as_view(), name="messages"),
    path("messages/hide", ChatMessagesBulkHideAPIView.as_view(), name="messages-hide"),
    path(
        "messages/<uuid:message_id>",
        ChatMessageDeletionAPIView.as_view(),
        name="message-detail",
    ),
    path(
        "messages/<uuid:message_id>/reactions",
        MessageReactionAPIView.as_view(),
        name="reactions",
    ),
    path(
        "messages/<uuid:message_id>/reactions/<str:emoji>",
        MessageReactionAPIView.as_view(),
        name="reaction-detail",
    ),
]
