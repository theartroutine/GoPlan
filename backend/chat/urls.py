from __future__ import annotations

from django.urls import path

from chat.views import TripChatMessagesAPIView

app_name = "chat"

urlpatterns = [
    path("messages", TripChatMessagesAPIView.as_view(), name="messages"),
]
