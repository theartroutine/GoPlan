from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from trips.models import MemberStatus, TripRole, TripStatus
from trips.permissions import IsProfileCompleted
from trips.serializers import (
    CreateCustomTypeSerializer,
    CreateSpecialSectionSerializer,
    CreateTimelineActivitySerializer,
    CreateTripSerializer,
    PatchCustomTypeSerializer,
    PatchSectionSerializer,
    PatchTimelineActivitySerializer,
    SendInvitationsSerializer,
    TripDetailSerializer,
    TripInvitationSerializer,
    TripListItemSerializer,
    TripMemberSerializer,
    TripResponseSerializer,
    UpdateTimelineActivityStatusSerializer,
    UpdateTripSerializer,
    build_timeline_response,
    serialize_activity,
    serialize_custom_type,
    serialize_section,
)
from trips.services import (
    CannotRemoveSelfError,
    CaptainCannotLeaveError,
    InvitationError,
    InviteError,
    NotTripMemberError,
    StatusTransitionError,
    TimelineActivityNotFoundError,
    TimelineCustomTypeDuplicateError,
    TimelineCustomTypeInUseError,
    TimelineCustomTypeNotFoundError,
    TimelineInvalidAssigneeError,
    TimelineInvalidCustomTypeError,
    TimelineSectionDateConflictError,
    TimelineSectionNotEmptyError,
    TimelineSectionNotFoundError,
    TimelineSectionRequiredError,
    TripNotFoundError,
    TripPermissionError,
    TripTerminalError,
    accept_invitation,
    cancel_trip,
    complete_trip,
    create_custom_type,
    create_timeline_day,
    create_timeline_activity,
    create_trip,
    decline_invitation,
    delete_custom_type,
    delete_section,
    delete_timeline_activity,
    get_invitable_friends,
    get_pending_invitations,
    get_trip_detail,
    get_trip_timeline,
    get_user_trips,
    leave_trip,
    patch_custom_type,
    patch_section,
    patch_timeline_activity,
    remove_member,
    send_trip_invitations,
    start_trip,
    update_timeline_activity_status,
    update_trip,
)

TRIP_PERMISSIONS = [permissions.IsAuthenticated, IsProfileCompleted]


class TripListPagination(CursorPagination):
    page_size = 20
    ordering = "-created_at"
    cursor_query_param = "cursor"


def _has_invalid_timezone_error(errors) -> bool:
    timezone_errors = errors.get("timezone")
    if timezone_errors is None:
        return False
    return any(getattr(error, "code", None) == "invalid_timezone" for error in timezone_errors)


def _validate_trip_serializer(serializer):
    if serializer.is_valid():
        return None
    if _has_invalid_timezone_error(serializer.errors):
        return Response(
            {"detail": "Invalid trip timezone.", "error_code": "INVALID_TIMEZONE"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TripListCreateAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_list_create"

    def get(self, request):
        trips = get_user_trips(request.user)
        paginator = TripListPagination()
        page = paginator.paginate_queryset(trips, request)
        serializer = TripListItemSerializer(page, many=True, context={"request_user": request.user})
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = CreateTripSerializer(data=request.data)
        invalid_response = _validate_trip_serializer(serializer)
        if invalid_response is not None:
            return invalid_response
        d = serializer.validated_data
        trip = create_trip(
            captain=request.user,
            name=d["name"],
            destination=d["destination"],
            destination_provider=d.get("destination_provider", ""),
            destination_provider_id=d.get("destination_provider_id", ""),
            destination_lat=d.get("destination_lat"),
            destination_lng=d.get("destination_lng"),
            destination_country_code=d.get("destination_country_code", ""),
            cover_image_url=d.get("cover_image_url", ""),
            start_date=d["start_date"],
            end_date=d["end_date"],
            description=d.get("description", ""),
            currency_code=d.get("currency_code", "VND"),
            timezone=d.get("timezone", "Asia/Ho_Chi_Minh"),
            budget_estimate=d.get("budget_estimate"),
        )
        return Response(
            {"trip": TripResponseSerializer(trip).data},
            status=status.HTTP_201_CREATED,
        )


class TripDetailUpdateAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_detail_update"

    def get(self, request, trip_id):
        try:
            trip, my_membership = get_trip_detail(trip_id, request.user)
        except TripNotFoundError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_403_FORBIDDEN)
        members = trip.memberships.filter(status=MemberStatus.ACTIVE).select_related("user")
        return Response({
            "trip": TripDetailSerializer(trip).data,
            "my_membership": {
                "role": my_membership.role,
                "status": my_membership.status,
                "joined_at": my_membership.joined_at,
            },
            "members": TripMemberSerializer(members, many=True).data,
        })

    def patch(self, request, trip_id):
        try:
            trip, my_membership = get_trip_detail(trip_id, request.user)
        except TripNotFoundError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_403_FORBIDDEN)
        if my_membership.role != TripRole.CAPTAIN:
            return Response(
                {"detail": "Only the captain can edit trip info.", "error_code": "NOT_CAPTAIN"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if trip.status in (TripStatus.COMPLETED, TripStatus.CANCELLED):
            return Response(
                {"detail": "Cannot edit a trip that is completed or cancelled.", "error_code": "TRIP_TERMINAL"},
                status=status.HTTP_409_CONFLICT,
            )
        serializer = UpdateTripSerializer(data=request.data, context={"trip": trip})
        invalid_response = _validate_trip_serializer(serializer)
        if invalid_response is not None:
            return invalid_response
        d = serializer.validated_data
        try:
            updated = update_trip(
                trip,
                **{k: v for k, v in d.items()},
            )
        except TimelineSectionDateConflictError as exc:
            return Response(
                {"detail": str(exc), "error_code": exc.error_code},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({"trip": TripDetailSerializer(updated).data})


class TripInvitationsAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_send_invitations"

    def get(self, request, trip_id):
        try:
            trip, membership = get_trip_detail(trip_id, request.user)
        except TripNotFoundError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_403_FORBIDDEN)
        if membership.role != TripRole.CAPTAIN:
            return Response(
                {"detail": "Only the captain can view invitations.", "error_code": "NOT_CAPTAIN"},
                status=status.HTTP_403_FORBIDDEN,
            )
        invitations = get_pending_invitations(trip)
        return Response({"invitations": TripInvitationSerializer(invitations, many=True).data})

    def post(self, request, trip_id):
        try:
            trip, membership = get_trip_detail(trip_id, request.user)
        except TripNotFoundError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_403_FORBIDDEN)
        if membership.role != TripRole.CAPTAIN:
            return Response(
                {"detail": "Only the captain can send invitations.", "error_code": "NOT_CAPTAIN"},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = SendInvitationsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invitations = send_trip_invitations(
                trip=trip,
                captain=request.user,
                invitee_ids=serializer.validated_data["invitee_ids"],
            )
        except InviteError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"invitations": TripInvitationSerializer(invitations, many=True).data},
            status=status.HTTP_201_CREATED,
        )


class InvitableFriendsAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_invitable_friends"

    def get(self, request, trip_id):
        try:
            trip, membership = get_trip_detail(trip_id, request.user)
        except TripNotFoundError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_403_FORBIDDEN)
        if membership.role != TripRole.CAPTAIN:
            return Response(
                {"detail": "Only the captain can view invitable friends.", "error_code": "NOT_CAPTAIN"},
                status=status.HTTP_403_FORBIDDEN,
            )
        users = get_invitable_friends(trip, request.user)
        data = [
            {"id": str(u.id), "display_name": u.display_name, "identify_tag": u.identify_tag}
            for u in users
        ]
        return Response({"users": data})


class AcceptInvitationAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_accept_invitation"

    def post(self, request, inv_id):
        try:
            membership = accept_invitation(invitation_id=inv_id, actor=request.user)
        except TripNotFoundError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_404_NOT_FOUND)
        except TripPermissionError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_403_FORBIDDEN)
        except InvitationError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_409_CONFLICT)
        return Response({"membership_id": str(membership.id)}, status=status.HTTP_200_OK)


class DeclineInvitationAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_decline_invitation"

    def post(self, request, inv_id):
        try:
            invitation = decline_invitation(invitation_id=inv_id, actor=request.user)
        except TripNotFoundError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_404_NOT_FOUND)
        except TripPermissionError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_403_FORBIDDEN)
        except InvitationError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_409_CONFLICT)
        return Response({"invitation_id": str(invitation.id)}, status=status.HTTP_200_OK)


class StartTripAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_start"

    def post(self, request, trip_id):
        try:
            trip = start_trip(trip_id=trip_id, actor=request.user)
        except TripNotFoundError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_404_NOT_FOUND)
        except TripPermissionError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_403_FORBIDDEN)
        except StatusTransitionError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_409_CONFLICT)
        return Response({"status": trip.status}, status=status.HTTP_200_OK)


class CompleteTripAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_complete"

    def post(self, request, trip_id):
        try:
            trip = complete_trip(trip_id=trip_id, actor=request.user)
        except TripNotFoundError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_404_NOT_FOUND)
        except TripPermissionError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_403_FORBIDDEN)
        except StatusTransitionError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_409_CONFLICT)
        return Response({"status": trip.status}, status=status.HTTP_200_OK)


class CancelTripAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_cancel"

    def post(self, request, trip_id):
        try:
            trip = cancel_trip(trip_id=trip_id, actor=request.user)
        except TripNotFoundError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_404_NOT_FOUND)
        except TripPermissionError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_403_FORBIDDEN)
        except StatusTransitionError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_409_CONFLICT)
        return Response({"status": trip.status}, status=status.HTTP_200_OK)


class RemoveMemberAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_remove_member"

    def delete(self, request, trip_id, user_id):
        try:
            remove_member(trip_id=trip_id, target_user_id=user_id, actor=request.user)
        except TripNotFoundError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_404_NOT_FOUND)
        except TripPermissionError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_403_FORBIDDEN)
        except CannotRemoveSelfError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_400_BAD_REQUEST)
        except StatusTransitionError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_409_CONFLICT)
        return Response({}, status=status.HTTP_200_OK)


class TripTimelineAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_timeline_detail"

    def get(self, request, trip_id):
        try:
            trip, my_membership = get_trip_detail(trip_id, request.user)
        except TripNotFoundError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_403_FORBIDDEN)

        sections, custom_types = get_trip_timeline(trip)
        is_captain = my_membership.role == TripRole.CAPTAIN
        is_terminal = trip.status in (TripStatus.COMPLETED, TripStatus.CANCELLED)
        payload = build_timeline_response(
            trip=trip,
            sections=sections,
            custom_types=custom_types,
            is_captain=is_captain,
            is_terminal=is_terminal,
            viewer_user_id=request.user.id,
        )
        return Response(payload, status=status.HTTP_200_OK)


class LeaveTripAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_leave"

    def post(self, request, trip_id):
        try:
            leave_trip(trip_id=trip_id, actor=request.user)
        except TripNotFoundError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_404_NOT_FOUND)
        except NotTripMemberError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_403_FORBIDDEN)
        except CaptainCannotLeaveError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_400_BAD_REQUEST)
        except StatusTransitionError as exc:
            return Response({"detail": str(exc), "error_code": exc.error_code}, status=status.HTTP_409_CONFLICT)
        return Response({}, status=status.HTTP_200_OK)


# -------- Timeline mutation views (Phase 2) --------

def _err(detail, code, http_status):
    return Response({"detail": detail, "error_code": code}, status=http_status)


def _handle_common(exc):
    """Map common service errors to a Response. Returns None if exc not handled."""
    if isinstance(exc, TripNotFoundError):
        return _err(str(exc), exc.error_code, status.HTTP_404_NOT_FOUND)
    if isinstance(exc, NotTripMemberError):
        return _err(str(exc), exc.error_code, status.HTTP_403_FORBIDDEN)
    if isinstance(exc, TripPermissionError):
        return _err(str(exc), exc.error_code, status.HTTP_403_FORBIDDEN)
    if isinstance(exc, TripTerminalError):
        return _err(str(exc), exc.error_code, status.HTTP_409_CONFLICT)
    if isinstance(exc, TimelineSectionNotFoundError):
        return _err(str(exc), exc.error_code, status.HTTP_404_NOT_FOUND)
    if isinstance(exc, TimelineActivityNotFoundError):
        return _err(str(exc), exc.error_code, status.HTTP_404_NOT_FOUND)
    if isinstance(exc, TimelineCustomTypeNotFoundError):
        return _err(str(exc), exc.error_code, status.HTTP_404_NOT_FOUND)
    if isinstance(exc, TimelineSectionNotEmptyError):
        return _err(str(exc), exc.error_code, status.HTTP_409_CONFLICT)
    if isinstance(exc, TimelineSectionRequiredError):
        return _err(str(exc), exc.error_code, status.HTTP_409_CONFLICT)
    if isinstance(exc, TimelineSectionDateConflictError):
        return _err(str(exc), exc.error_code, status.HTTP_409_CONFLICT)
    if isinstance(exc, TimelineCustomTypeInUseError):
        return _err(str(exc), exc.error_code, status.HTTP_409_CONFLICT)
    if isinstance(exc, TimelineCustomTypeDuplicateError):
        return _err(str(exc), exc.error_code, status.HTTP_409_CONFLICT)
    if isinstance(exc, TimelineSectionDateConflictError):
        return _err(str(exc), exc.error_code, status.HTTP_409_CONFLICT)
    if isinstance(exc, TimelineInvalidAssigneeError):
        return _err(str(exc), exc.error_code, status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, TimelineInvalidCustomTypeError):
        return _err(str(exc), exc.error_code, status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, StatusTransitionError):
        return _err(str(exc), exc.error_code, status.HTTP_409_CONFLICT)
    return None


class TimelineSectionListCreateAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_timeline_sections"

    def post(self, request, trip_id):
        serializer = CreateSpecialSectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            trip, section = create_timeline_day(
                trip_id=trip_id,
                actor=request.user,
                section_date=serializer.validated_data["section_date"],
                label=serializer.validated_data["label"],
            )
        except Exception as exc:
            mapped = _handle_common(exc)
            if mapped is not None:
                return mapped
            raise
        return Response({"section": serialize_section(section, trip=trip)}, status=status.HTTP_201_CREATED)


class TimelineSectionDetailAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_timeline_section_detail"

    def patch(self, request, trip_id, section_id):
        serializer = PatchSectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        kwargs = {}
        if "label" in serializer.validated_data:
            kwargs["label"] = serializer.validated_data["label"]
        if "section_date" in serializer.validated_data:
            kwargs["section_date"] = serializer.validated_data["section_date"]
        try:
            trip, section = patch_section(
                trip_id=trip_id, section_id=section_id, actor=request.user, **kwargs
            )
        except Exception as exc:
            mapped = _handle_common(exc)
            if mapped is not None:
                return mapped
            raise
        return Response({"section": serialize_section(section, trip=trip)})

    def delete(self, request, trip_id, section_id):
        try:
            delete_section(trip_id=trip_id, section_id=section_id, actor=request.user)
        except Exception as exc:
            mapped = _handle_common(exc)
            if mapped is not None:
                return mapped
            raise
        return Response({}, status=status.HTTP_200_OK)


class TimelineActivityListCreateAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_timeline_activities"

    def post(self, request, trip_id, section_id):
        serializer = CreateTimelineActivitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            activity = create_timeline_activity(
                trip_id=trip_id,
                section_id=section_id,
                actor=request.user,
                data=serializer.validated_data,
            )
        except Exception as exc:
            mapped = _handle_common(exc)
            if mapped is not None:
                return mapped
            raise
        return Response(
            {
                "activity": serialize_activity(
                    activity,
                    viewer_user_id=request.user.id,
                    is_captain=True,
                    is_terminal=False,
                )
            },
            status=status.HTTP_201_CREATED,
        )


class TimelineActivityDetailAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_timeline_activity_detail"

    def patch(self, request, trip_id, activity_id):
        serializer = PatchTimelineActivitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            activity = patch_timeline_activity(
                trip_id=trip_id,
                activity_id=activity_id,
                actor=request.user,
                data=serializer.validated_data,
            )
        except Exception as exc:
            mapped = _handle_common(exc)
            if mapped is not None:
                return mapped
            raise
        return Response(
            {
                "activity": serialize_activity(
                    activity,
                    viewer_user_id=request.user.id,
                    is_captain=True,
                    is_terminal=False,
                )
            }
        )

    def delete(self, request, trip_id, activity_id):
        try:
            delete_timeline_activity(
                trip_id=trip_id, activity_id=activity_id, actor=request.user
            )
        except Exception as exc:
            mapped = _handle_common(exc)
            if mapped is not None:
                return mapped
            raise
        return Response({}, status=status.HTTP_200_OK)


class TimelineActivityStatusAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_timeline_activity_status"

    def post(self, request, trip_id, activity_id):
        serializer = UpdateTimelineActivityStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            activity = update_timeline_activity_status(
                trip_id=trip_id,
                activity_id=activity_id,
                actor=request.user,
                status=serializer.validated_data["status"],
            )
        except Exception as exc:
            mapped = _handle_common(exc)
            if mapped is not None:
                return mapped
            raise
        return Response(
            {"activity_id": str(activity.id), "status": activity.status},
            status=status.HTTP_200_OK,
        )


class TimelineCustomTypeListCreateAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_timeline_custom_types"

    def post(self, request, trip_id):
        serializer = CreateCustomTypeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            ct = create_custom_type(
                trip_id=trip_id,
                actor=request.user,
                name=serializer.validated_data["name"],
                color_token=serializer.validated_data.get("color_token", "slate"),
                icon_key=serializer.validated_data.get("icon_key", "tag"),
            )
        except Exception as exc:
            mapped = _handle_common(exc)
            if mapped is not None:
                return mapped
            raise
        return Response({"custom_type": serialize_custom_type(ct)}, status=status.HTTP_201_CREATED)


class TimelineCustomTypeDetailAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS
    throttle_scope = "trips_timeline_custom_type_detail"

    def patch(self, request, trip_id, type_id):
        serializer = PatchCustomTypeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            ct = patch_custom_type(
                trip_id=trip_id,
                type_id=type_id,
                actor=request.user,
                data=serializer.validated_data,
            )
        except Exception as exc:
            mapped = _handle_common(exc)
            if mapped is not None:
                return mapped
            raise
        return Response({"custom_type": serialize_custom_type(ct)})

    def delete(self, request, trip_id, type_id):
        try:
            delete_custom_type(trip_id=trip_id, type_id=type_id, actor=request.user)
        except Exception as exc:
            mapped = _handle_common(exc)
            if mapped is not None:
                return mapped
            raise
        return Response({}, status=status.HTTP_200_OK)
