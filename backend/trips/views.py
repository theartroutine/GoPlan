from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from trips.models import MemberStatus, Trip, TripMember, TripRole
from trips.permissions import IsProfileCompleted
from trips.serializers import (
    CreateTripSerializer,
    TripDetailSerializer,
    TripListItemSerializer,
    TripMemberSerializer,
    TripResponseSerializer,
    UpdateTripSerializer,
)
from trips.services import create_trip, get_user_trips, update_trip

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

    def _get_trip_and_membership(self, request, trip_id):
        from rest_framework.exceptions import NotFound, PermissionDenied
        try:
            trip = Trip.objects.get(pk=trip_id)
        except Trip.DoesNotExist:
            raise NotFound("Trip not found.")
        membership = TripMember.objects.filter(
            trip=trip, user=request.user, status=MemberStatus.ACTIVE
        ).first()
        if not membership:
            raise PermissionDenied("You are not a member of this trip.")
        return trip, membership

    def get(self, request, trip_id):
        trip, my_membership = self._get_trip_and_membership(request, trip_id)
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
        trip, my_membership = self._get_trip_and_membership(request, trip_id)
        if my_membership.role != TripRole.CAPTAIN:
            return Response(
                {"detail": "Only the captain can edit trip info.", "error_code": "NOT_CAPTAIN"},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = UpdateTripSerializer(data=request.data, context={"trip": trip})
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        updated = update_trip(trip, **d)
        return Response({"trip": TripDetailSerializer(updated).data})
