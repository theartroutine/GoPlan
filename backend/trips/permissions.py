from __future__ import annotations

from rest_framework.permissions import BasePermission

from trips.models import MemberStatus, TripMember, TripRole


class IsProfileCompleted(BasePermission):
    """Reuse same check as friends app — user must have completed profile."""
    message = "Complete verification and profile setup to use this feature."

    def has_permission(self, request, view):
        user = request.user
        if not user or user.is_anonymous:
            return False
        return user.email_verified and user.is_profile_completed


class IsTripMember(BasePermission):
    """Allows access only if request.user is an ACTIVE member of the trip (set on view as self.trip)."""
    message = "You are not a member of this trip."

    def has_permission(self, request, view):
        trip = getattr(view, "trip", None)
        if trip is None:
            return False
        return TripMember.objects.filter(
            trip=trip, user=request.user, status=MemberStatus.ACTIVE
        ).exists()


class IsTripCaptain(BasePermission):
    """Allows access only if request.user is the CAPTAIN of the trip (set on view as self.trip)."""
    message = "Only the trip captain can perform this action."

    def has_permission(self, request, view):
        trip = getattr(view, "trip", None)
        if trip is None:
            return False
        return TripMember.objects.filter(
            trip=trip, user=request.user, role=TripRole.CAPTAIN, status=MemberStatus.ACTIVE
        ).exists()
