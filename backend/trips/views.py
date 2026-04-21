from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from trips.models import MemberStatus, TripRole, TripStatus
from trips.permissions import IsProfileCompleted
from trips.serializers import (
    CreateTripSerializer,
    SendInvitationsSerializer,
    TripDetailSerializer,
    TripInvitationSerializer,
    TripListItemSerializer,
    TripMemberSerializer,
    TripResponseSerializer,
    UpdateTripSerializer,
)
from trips.services import (
    InvitationError,
    InviteError,
    StatusTransitionError,
    accept_invitation,
    cancel_trip,
    complete_trip,
    create_trip,
    decline_invitation,
    get_invitable_friends,
    get_pending_invitations,
    get_trip_detail,
    get_user_trips,
    leave_trip,
    remove_member,
    send_trip_invitations,
    start_trip,
    update_trip,
)

TRIP_PERMISSIONS = [permissions.IsAuthenticated, IsProfileCompleted]


class TripListPagination(LimitOffsetPagination):
    default_limit = 20
    max_limit = 50


class TripListCreateAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS

    def get(self, request):
        trips = get_user_trips(request.user)
        paginator = TripListPagination()
        page = paginator.paginate_queryset(trips, request)
        serializer = TripListItemSerializer(page, many=True, context={"request_user": request.user})
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = CreateTripSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
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
            budget_estimate=d.get("budget_estimate"),
        )
        return Response(
            {"trip": TripResponseSerializer(trip).data},
            status=status.HTTP_201_CREATED,
        )


class TripDetailUpdateAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS

    def get(self, request, trip_id):
        trip, my_membership = get_trip_detail(trip_id, request.user)
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
        trip, my_membership = get_trip_detail(trip_id, request.user)
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
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        updated = update_trip(
            trip,
            **{k: v for k, v in d.items()},
        )
        return Response({"trip": TripDetailSerializer(updated).data})


class TripInvitationsAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS

    def get(self, request, trip_id):
        trip, membership = get_trip_detail(trip_id, request.user)
        if membership.role != TripRole.CAPTAIN:
            return Response(
                {"detail": "Only the captain can view invitations.", "error_code": "NOT_CAPTAIN"},
                status=status.HTTP_403_FORBIDDEN,
            )
        invitations = get_pending_invitations(trip)
        return Response({"invitations": TripInvitationSerializer(invitations, many=True).data})

    def post(self, request, trip_id):
        trip, membership = get_trip_detail(trip_id, request.user)
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
            return Response({"detail": str(exc), "error_code": "INVITE_ERROR"}, status=400)
        return Response(
            {"invitations": TripInvitationSerializer(invitations, many=True).data},
            status=status.HTTP_201_CREATED,
        )


class InvitableFriendsAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS

    def get(self, request, trip_id):
        trip, membership = get_trip_detail(trip_id, request.user)
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

    def post(self, request, inv_id):
        try:
            membership = accept_invitation(invitation_id=inv_id, actor=request.user)
        except InvitationError as exc:
            return Response({"detail": str(exc), "error_code": "INVITATION_NOT_PENDING"}, status=409)
        return Response({"membership_id": str(membership.id)}, status=200)


class DeclineInvitationAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS

    def post(self, request, inv_id):
        try:
            invitation = decline_invitation(invitation_id=inv_id, actor=request.user)
        except InvitationError as exc:
            return Response({"detail": str(exc), "error_code": "INVITATION_NOT_PENDING"}, status=409)
        return Response({"invitation_id": str(invitation.id)}, status=200)


class StartTripAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS

    def post(self, request, trip_id):
        try:
            trip = start_trip(trip_id=trip_id, actor=request.user)
        except StatusTransitionError as exc:
            return Response({"detail": str(exc), "error_code": "INVALID_STATUS_TRANSITION"}, status=409)
        return Response({"status": trip.status}, status=200)


class CompleteTripAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS

    def post(self, request, trip_id):
        try:
            trip = complete_trip(trip_id=trip_id, actor=request.user)
        except StatusTransitionError as exc:
            return Response({"detail": str(exc), "error_code": "INVALID_STATUS_TRANSITION"}, status=409)
        return Response({"status": trip.status}, status=200)


class CancelTripAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS

    def post(self, request, trip_id):
        try:
            trip = cancel_trip(trip_id=trip_id, actor=request.user)
        except StatusTransitionError as exc:
            return Response({"detail": str(exc), "error_code": "TRIP_TERMINAL"}, status=409)
        return Response({"status": trip.status}, status=200)


class RemoveMemberAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS

    def delete(self, request, trip_id, user_id):
        from rest_framework.exceptions import ValidationError as DRFValidationError
        try:
            remove_member(trip_id=trip_id, target_user_id=user_id, actor=request.user)
        except DRFValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict):
                return Response(detail, status=400)
            return Response({"detail": str(exc)}, status=400)
        except StatusTransitionError as exc:
            return Response({"detail": str(exc), "error_code": "TRIP_TERMINAL"}, status=409)
        return Response({}, status=200)


class LeaveTripAPIView(APIView):
    permission_classes = TRIP_PERMISSIONS

    def post(self, request, trip_id):
        from rest_framework.exceptions import ValidationError as DRFValidationError
        try:
            leave_trip(trip_id=trip_id, actor=request.user)
        except DRFValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict):
                return Response(detail, status=400)
            return Response({"detail": str(exc)}, status=400)
        except StatusTransitionError as exc:
            return Response({"detail": str(exc), "error_code": "TRIP_TERMINAL"}, status=409)
        return Response({}, status=200)
