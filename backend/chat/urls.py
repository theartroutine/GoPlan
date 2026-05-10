from __future__ import annotations

from django.urls import path

from chat.views import MessageReactionAPIView, TripChatMessagesAPIView

app_name = "chat"

urlpatterns = [
    path("messages", TripChatMessagesAPIView.as_view(), name="messages"),
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
