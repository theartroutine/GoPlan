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
