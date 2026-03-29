from django.urls import path

from notifications.views import (
    NotificationListAPIView,
    NotificationMarkAllReadAPIView,
    NotificationMarkReadAPIView,
    NotificationUnreadCountAPIView,
)

app_name = "notifications"

urlpatterns = [
    path("", NotificationListAPIView.as_view(), name="list"),
    path(
        "unread-count",
        NotificationUnreadCountAPIView.as_view(),
        name="unread-count",
    ),
    path(
        "<uuid:notification_id>/read",
        NotificationMarkReadAPIView.as_view(),
        name="mark-read",
    ),
    path(
        "read-all",
        NotificationMarkAllReadAPIView.as_view(),
        name="mark-all-read",
    ),
]
