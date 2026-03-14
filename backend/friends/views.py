from rest_framework import permissions, status
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from friends.models import FriendRequest, FriendRequestStatus, Friendship
from friends.permissions import IsProfileCompleted
from friends.serializers import (
    FriendRequestSerializer,
    FriendSerializer,
    SendFriendRequestSerializer,
)
from friends.services import (
    AlreadyFriendsError,
    DuplicatePendingRequestError,
    FriendLimitReachedError,
    FriendRequestNotFoundError,
    FriendServiceError,
    FriendshipNotFoundError,
    InvalidRequestStateError,
    NotFriendshipParticipantError,
    NotRequestParticipantError,
    SelfRequestError,
    UserNotFoundError,
    accept_friend_request,
    cancel_friend_request,
    decline_friend_request,
    remove_friendship,
    search_user_by_identify_tag,
    send_friend_request,
)


# -------- Error Mapping --------

FRIEND_ERROR_MAP = {
    SelfRequestError: (400, "SELF_REQUEST"),
    DuplicatePendingRequestError: (409, "DUPLICATE_PENDING"),
    AlreadyFriendsError: (409, "ALREADY_FRIENDS"),
    FriendLimitReachedError: (409, "FRIEND_LIMIT_REACHED"),
    UserNotFoundError: (404, "USER_NOT_FOUND"),
    FriendRequestNotFoundError: (404, "FRIEND_REQUEST_NOT_FOUND"),
    FriendshipNotFoundError: (404, "FRIENDSHIP_NOT_FOUND"),
    InvalidRequestStateError: (409, "INVALID_REQUEST_STATE"),
    NotRequestParticipantError: (403, "NOT_REQUEST_PARTICIPANT"),
    NotFriendshipParticipantError: (403, "NOT_FRIENDSHIP_PARTICIPANT"),
}


def _handle_friend_error(exc):
    for error_class, (http_status, error_code) in FRIEND_ERROR_MAP.items():
        if isinstance(exc, error_class):
            return Response(
                {"detail": str(exc), "error_code": error_code},
                status=http_status,
            )
    return Response(
        {"detail": "An unexpected error occurred."},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


# -------- Pagination --------


class FriendListPagination(LimitOffsetPagination):
    default_limit = 20
    max_limit = 50


# -------- Views --------

FRIEND_PERMISSIONS = [permissions.IsAuthenticated, IsProfileCompleted]


class SendFriendRequestAPIView(APIView):
    permission_classes = FRIEND_PERMISSIONS
    throttle_scope = "friends_send_request"

    def post(self, request):
        serializer = SendFriendRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            friend_request = send_friend_request(
                sender=request.user,
                identify_tag=serializer.validated_data["identify_tag"],
            )
        except FriendServiceError as exc:
            return _handle_friend_error(exc)

        return Response(
            {"friend_request": FriendRequestSerializer(friend_request).data},
            status=status.HTTP_201_CREATED,
        )


class IncomingFriendRequestsAPIView(APIView):
    permission_classes = FRIEND_PERMISSIONS
    throttle_scope = "friends_requests_list"

    def get(self, request):
        queryset = FriendRequest.objects.filter(
            receiver=request.user,
            status=FriendRequestStatus.PENDING,
        ).select_related("sender", "receiver")

        paginator = FriendListPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = FriendRequestSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class OutgoingFriendRequestsAPIView(APIView):
    permission_classes = FRIEND_PERMISSIONS
    throttle_scope = "friends_requests_list"

    def get(self, request):
        queryset = FriendRequest.objects.filter(
            sender=request.user,
            status=FriendRequestStatus.PENDING,
        ).select_related("sender", "receiver")

        paginator = FriendListPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = FriendRequestSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class AcceptFriendRequestAPIView(APIView):
    permission_classes = FRIEND_PERMISSIONS
    throttle_scope = "friends_respond"

    def post(self, request, id):
        try:
            friendship = accept_friend_request(
                friend_request_id=id,
                actor=request.user,
            )
        except FriendServiceError as exc:
            return _handle_friend_error(exc)

        return Response(
            {
                "friendship": FriendSerializer(
                    friendship, context={"request_user": request.user}
                ).data,
                "friend_request_id": str(id),
            },
            status=status.HTTP_200_OK,
        )


class DeclineFriendRequestAPIView(APIView):
    permission_classes = FRIEND_PERMISSIONS
    throttle_scope = "friends_respond"

    def post(self, request, id):
        try:
            fr = decline_friend_request(
                friend_request_id=id,
                actor=request.user,
            )
        except FriendServiceError as exc:
            return _handle_friend_error(exc)

        return Response(
            {"friend_request": FriendRequestSerializer(fr).data},
            status=status.HTTP_200_OK,
        )


class CancelFriendRequestAPIView(APIView):
    permission_classes = FRIEND_PERMISSIONS
    throttle_scope = "friends_respond"

    def post(self, request, id):
        try:
            fr = cancel_friend_request(
                friend_request_id=id,
                actor=request.user,
            )
        except FriendServiceError as exc:
            return _handle_friend_error(exc)

        return Response(
            {"friend_request": FriendRequestSerializer(fr).data},
            status=status.HTTP_200_OK,
        )


class FriendListAPIView(APIView):
    permission_classes = FRIEND_PERMISSIONS
    throttle_scope = "friends_list"

    def get(self, request):
        from django.db.models import Q

        queryset = Friendship.objects.filter(
            Q(user_low=request.user) | Q(user_high=request.user)
        ).select_related("user_low", "user_high")

        paginator = FriendListPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = FriendSerializer(
            page, many=True, context={"request_user": request.user}
        )
        return paginator.get_paginated_response(serializer.data)


class RemoveFriendAPIView(APIView):
    permission_classes = FRIEND_PERMISSIONS
    throttle_scope = "friends_remove"

    def delete(self, request, id):
        try:
            remove_friendship(friendship_id=id, actor=request.user)
        except FriendServiceError as exc:
            return _handle_friend_error(exc)

        return Response(status=status.HTTP_204_NO_CONTENT)


class UserSearchAPIView(APIView):
    permission_classes = FRIEND_PERMISSIONS
    throttle_scope = "friends_search"

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query or "#" not in query:
            return Response(
                {
                    "detail": "Invalid search query. Use format name#CODE.",
                    "error_code": "INVALID_SEARCH_QUERY",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate format before hitting service — reuse serializer validation
        serializer = SendFriendRequestSerializer(
            data={"identify_tag": query}
        )
        if not serializer.is_valid():
            return Response(
                {
                    "detail": "Invalid search query. Use format name#CODE.",
                    "error_code": "INVALID_SEARCH_QUERY",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = search_user_by_identify_tag(
            serializer.validated_data["identify_tag"], request.user
        )
        return Response({"user": result}, status=status.HTTP_200_OK)
