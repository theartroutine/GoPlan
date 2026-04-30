"""Shared timeline test fixtures, reused across Phase 1-4 timeline tests."""
from __future__ import annotations

from datetime import date, time, timedelta
from typing import Optional

from trips.models import (
    MemberStatus,
    TimelineActivity,
    TimelineActivityAssigneeScope,
    TimelineActivityStatus,
    TimelineActivityTimeMode,
    TimelineLocationMode,
    TimelineSection,
    Trip,
    TripMember,
    TripRole,
    TripStatus,
)
from trips.services import seed_starter_timeline_days


def make_trip_with_timeline(
    *,
    captain,
    name: str = "Test Trip",
    destination: str = "Da Lat",
    start_date: date = date(2026, 6, 1),
    end_date: date = date(2026, 6, 3),
    timezone: str = "Asia/Ho_Chi_Minh",
    status: str = TripStatus.PLANNING,
    members: Optional[list] = None,
) -> Trip:
    """Create a trip + captain membership and seed timeline days via the service."""
    trip = Trip.objects.create(
        name=name,
        destination=destination,
        start_date=start_date,
        end_date=end_date,
        timezone=timezone,
        status=status,
        created_by=captain,
    )
    TripMember.objects.create(trip=trip, user=captain, role=TripRole.CAPTAIN, status=MemberStatus.ACTIVE)
    for member in members or []:
        TripMember.objects.create(trip=trip, user=member, role=TripRole.MEMBER, status=MemberStatus.ACTIVE)
    seed_starter_timeline_days(trip)
    return trip


def make_timeline_section(
    *,
    trip: Trip,
    section_date: Optional[date] = None,
    label: str = "Day 0",
    is_label_custom: bool = True,
    position: int = 0,
) -> TimelineSection:
    return TimelineSection.objects.create(
        trip=trip,
        section_date=section_date or trip.start_date - timedelta(days=1),
        label=label,
        is_label_custom=is_label_custom,
        position=position,
    )


def make_timeline_activity(
    *,
    trip: Trip,
    section: TimelineSection,
    title: str = "Sample activity",
    time_mode: str = TimelineActivityTimeMode.AT_TIME,
    start_time: Optional[time] = time(9, 0),
    end_time: Optional[time] = None,
    status: str = TimelineActivityStatus.UPCOMING,
    system_type: str = "TRANSPORTATION",
    custom_type=None,
    position: int = 0,
    assignee_scope: Optional[str] = None,
    assignee_user=None,
    location_mode: str = TimelineLocationMode.MANUAL,
    location_label: str = "",
) -> TimelineActivity:
    resolved_assignee_scope = (
        assignee_scope
        or (
            TimelineActivityAssigneeScope.USER
            if assignee_user is not None
            else TimelineActivityAssigneeScope.NONE
        )
    )
    return TimelineActivity.objects.create(
        trip=trip,
        section=section,
        title=title,
        time_mode=time_mode,
        start_time=start_time,
        end_time=end_time,
        status=status,
        system_type=system_type if custom_type is None else "",
        custom_type=custom_type,
        position=position,
        assignee_scope=resolved_assignee_scope,
        assignee_user=assignee_user,
        location_mode=location_mode,
        location_label=location_label,
    )
