from django.urls import path

from realtime.views import WebSocketTicketAPIView, WsTicketRefreshAPIView

app_name = "realtime"

urlpatterns = [
    path("ws-ticket", WebSocketTicketAPIView.as_view(), name="ws-ticket"),
    path("ws-ticket/refresh", WsTicketRefreshAPIView.as_view(), name="ws-ticket-refresh"),
]
