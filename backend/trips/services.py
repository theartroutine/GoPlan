from __future__ import annotations

from django.db import transaction

from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus


# -------- Exceptions --------

class TripServiceError(Exception):
    pass


# -------- Services --------

def create_trip(
    *,
    captain,
    name: str,
    destination: str,
    start_date,
    end_date,
    description: str = "",
    currency_code: str = "VND",
    budget_estimate=None,
) -> Trip:
    """Create a trip and add the creator as CAPTAIN."""
    with transaction.atomic():
        trip = Trip.objects.create(
            name=name,
            destination=destination,
            start_date=start_date,
            end_date=end_date,
            description=description,
            currency_code=currency_code,
            budget_estimate=budget_estimate,
            status=TripStatus.PLANNING,
            created_by=captain,
        )
        TripMember.objects.create(
            trip=trip,
            user=captain,
            role=TripRole.CAPTAIN,
            status=MemberStatus.ACTIVE,
        )
    return trip


def get_user_trips(user):
    """Return all trips where user has an ACTIVE membership."""
    from django.db.models import Prefetch
    from trips.models import TripMember

    active_memberships = TripMember.objects.filter(status=MemberStatus.ACTIVE)
    return (
        Trip.objects.filter(memberships__user=user, memberships__status=MemberStatus.ACTIVE)
        .prefetch_related(Prefetch("memberships", queryset=active_memberships))
        .order_by("-created_at")
        .distinct()
    )


def get_trip_detail(trip_id, requesting_user):
    """Return (trip, my_membership) or raise 404/403."""
    from rest_framework.exceptions import NotFound, PermissionDenied
    try:
        trip = Trip.objects.get(pk=trip_id)
    except Trip.DoesNotExist:
        raise NotFound("Trip not found.")
    membership = TripMember.objects.filter(
        trip=trip, user=requesting_user, status=MemberStatus.ACTIVE
    ).first()
    if not membership:
        raise PermissionDenied("You are not a member of this trip.")
    return trip, membership


def update_trip(trip, *, name=None, destination=None, start_date=None,
                end_date=None, description=None, currency_code=None, budget_estimate=None):
    """Partially update trip fields. Only updates fields that are explicitly passed (not None)."""
    if name is not None:            trip.name = name
    if destination is not None:     trip.destination = destination
    if start_date is not None:      trip.start_date = start_date
    if end_date is not None:        trip.end_date = end_date
    if description is not None:     trip.description = description
    if currency_code is not None:   trip.currency_code = currency_code
    if budget_estimate is not None: trip.budget_estimate = budget_estimate
    trip.save()
    return trip
