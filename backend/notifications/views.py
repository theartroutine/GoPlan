from rest_framework import permissions, status
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications.models import Notification
from notifications.serializers import NotificationSerializer
from notifications.services import (
    NotificationNotFoundError,
    mark_all_notifications_read,
    mark_notification_read,
    resolve_trip_invitation_statuses,
)


# -------- Pagination --------


class NotificationCursorPagination(CursorPagination):
    page_size = 20
    ordering = "-created_at"


# -------- Views --------


class NotificationListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "notifications_list"

    def get(self, request):
        queryset = Notification.objects.filter(
            recipient=request.user
        ).select_related("actor")

        paginator = NotificationCursorPagination()
        page = paginator.paginate_queryset(queryset, request)
        invitation_statuses = resolve_trip_invitation_statuses(
            page,
            recipient_id=request.user.id,
        )
        serializer = NotificationSerializer(
            page,
            many=True,
            context={"invitation_statuses": invitation_statuses},
        )
        return paginator.get_paginated_response(serializer.data)


class NotificationUnreadCountAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "notifications_unread_count"

    def get(self, request):
        count = Notification.objects.filter(
            recipient=request.user, read_at__isnull=True
        ).count()
        return Response({"unread_count": count}, status=status.HTTP_200_OK)


class NotificationMarkReadAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "notifications_mark_read"

    def post(self, request, notification_id):
        try:
            mark_notification_read(notification_id, request.user)
        except NotificationNotFoundError:
            return Response(
                {
                    "detail": "Notification not found.",
                    "error_code": "NOTIFICATION_NOT_FOUND",
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(status=status.HTTP_200_OK)


class NotificationMarkAllReadAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "notifications_mark_all_read"

    def post(self, request):
        count = mark_all_notifications_read(request.user)
        return Response(
            {"updated_count": count}, status=status.HTTP_200_OK
        )
