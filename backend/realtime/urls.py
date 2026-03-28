from django.urls import path

from realtime.views import WebSocketTicketAPIView

app_name = "realtime"

urlpatterns = [
    path("ws-ticket", WebSocketTicketAPIView.as_view(), name="ws-ticket"),
]
