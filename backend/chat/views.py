from __future__ import annotations

import math

from rest_framework import permissions, status
from rest_framework.exceptions import Throttled
from rest_framework.response import Response
from rest_framework.views import APIView

from chat.serializers import ChatMessageListQuerySerializer, SendChatMessageSerializer
from chat.services import (
    ChatInvalidContentError,
    ChatInvalidCursorError,
    ChatServiceError,
    build_chat_message_payload,
    list_chat_messages,
    send_chat_message,
)
from trips.permissions import IsProfileCompleted
from trips.services import TripNotFoundError, TripServiceError, TripTerminalError

CHAT_PERMISSIONS = [permissions.IsAuthenticated, IsProfileCompleted]


def _error_response(detail: str, error_code: str, status_code: int) -> Response:
    return Response(
        {"detail": detail, "error_code": error_code},
        status=status_code,
    )


def _map_service_error(exc: Exception) -> tuple[str, int] | None:
    if isinstance(exc, TripNotFoundError):
        return exc.error_code, status.HTTP_404_NOT_FOUND
    if isinstance(exc, TripTerminalError):
        return exc.error_code, status.HTTP_409_CONFLICT
    if isinstance(exc, (ChatInvalidContentError, ChatInvalidCursorError)):
        return exc.error_code, status.HTTP_400_BAD_REQUEST
    if isinstance(exc, (TripServiceError, ChatServiceError)):
        return exc.error_code, status.HTTP_400_BAD_REQUEST
    return None


class TripChatMessagesAPIView(APIView):
    permission_classes = CHAT_PERMISSIONS

    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "chat_send"
        return super().get_throttles()

    def handle_exception(self, exc):
        if isinstance(exc, Throttled):
            response = _error_response(
                str(exc.detail),
                "THROTTLED",
                status.HTTP_429_TOO_MANY_REQUESTS,
            )
            if exc.wait is not None:
                response["Retry-After"] = str(math.ceil(exc.wait))
            return response
        return super().handle_exception(exc)

    def get(self, request, trip_id):
        serializer = ChatMessageListQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            payload = list_chat_messages(
                user=request.user,
                trip_id=trip_id,
                cursor=data.get("cursor"),
                limit=data.get("limit"),
                since=data.get("since"),
            )
        except Exception as exc:
            mapped = _map_service_error(exc)
            if mapped is None:
                raise
            error_code, status_code = mapped
            return _error_response(str(exc), error_code, status_code)

        return Response(payload, status=status.HTTP_200_OK)

    def post(self, request, trip_id):
        serializer = SendChatMessageSerializer(data=request.data)
        if not serializer.is_valid():
            return _error_response(
                "Message content is invalid.",
                "INVALID_CONTENT",
                status.HTTP_400_BAD_REQUEST,
            )
        data = serializer.validated_data

        try:
            message, created = send_chat_message(
                user=request.user,
                trip_id=trip_id,
                content=data["content"],
                client_message_id=data["client_message_id"],
            )
        except Exception as exc:
            mapped = _map_service_error(exc)
            if mapped is None:
                raise
            error_code, status_code = mapped
            return _error_response(str(exc), error_code, status_code)

        return Response(
            {"message": build_chat_message_payload(message)},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
