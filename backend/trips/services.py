from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from friends.models import Friendship
from notifications.models import NotificationType
from notifications.services import create_notification
from trips.models import InvitationStatus, MemberStatus, Trip, TripInvitation, TripMember, TripRole, TripStatus

User = get_user_model()


# -------- Exceptions --------

class TripServiceError(Exception):
    pass


class InviteError(TripServiceError):
    pass


class InvitationError(TripServiceError):
    pass


class StatusTransitionError(TripServiceError):
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


# -------- Invite helpers --------

def _are_friends(user_a, user_b) -> bool:
    """Check if two users are friends (canonical pair order)."""
    low, high = (user_a, user_b) if str(user_a.pk) < str(user_b.pk) else (user_b, user_a)
    return Friendship.objects.filter(user_low=low, user_high=high).exists()


def get_invitable_friends(trip, captain):
    """Return friends of captain who are not ACTIVE members and have no PENDING invitation."""
    active_member_ids = trip.memberships.filter(
        status=MemberStatus.ACTIVE
    ).values_list("user_id", flat=True)

    pending_invitee_ids = trip.invitations.filter(
        status=InvitationStatus.PENDING
    ).values_list("invitee_id", flat=True)

    excluded_ids = set(list(active_member_ids) + list(pending_invitee_ids))

    friend_ids = Friendship.objects.filter(
        Q(user_low=captain) | Q(user_high=captain)
    ).values_list("user_low_id", "user_high_id")

    eligible = []
    for low_id, high_id in friend_ids:
        fid = high_id if low_id == captain.pk else low_id
        if fid not in excluded_ids:
            eligible.append(fid)

    return User.objects.filter(pk__in=eligible, is_profile_completed=True)


def get_pending_invitations(trip):
    """Return PENDING invitations for a trip."""
    return trip.invitations.filter(status=InvitationStatus.PENDING).select_related("invitee")


def send_trip_invitations(trip, captain, invitee_ids: list) -> list:
    """Send invitations to a list of user IDs. Validates each and sends realtime notification."""
    if not invitee_ids:
        raise InviteError("No invitee IDs provided.")

    invitees = User.objects.filter(pk__in=invitee_ids, is_profile_completed=True)
    if len(invitees) != len(invitee_ids):
        raise InviteError("One or more users not found.")

    created = []
    with transaction.atomic():
        for invitee in invitees:
            if invitee == captain:
                raise InviteError("Cannot invite yourself.")

            if not _are_friends(captain, invitee):
                raise InviteError(f"{invitee.display_name} is not in your friends list.")

            if trip.memberships.filter(user=invitee, status=MemberStatus.ACTIVE).exists():
                raise InviteError(f"{invitee.display_name} is already a member.")

            if trip.invitations.filter(invitee=invitee, status=InvitationStatus.PENDING).exists():
                raise InviteError(f"{invitee.display_name} already has a pending invitation.")

            inv = TripInvitation.objects.create(
                trip=trip,
                inviter=captain,
                invitee=invitee,
                status=InvitationStatus.PENDING,
            )
            created.append(inv)

            create_notification(
                recipient=invitee,
                notification_type=NotificationType.TRIP_INVITATION,
                actor=captain,
                payload={
                    "trip_id": str(trip.id),
                    "trip_name": trip.name,
                    "destination": trip.destination,
                    "start_date": str(trip.start_date),
                    "end_date": str(trip.end_date),
                    "invitation_id": str(inv.id),
                },
            )

    return created


def accept_invitation(invitation_id, actor) -> TripMember:
    """Accept a PENDING invitation. Creates ACTIVE TripMember for invitee."""
    from rest_framework.exceptions import NotFound, PermissionDenied

    with transaction.atomic():
        try:
            invitation = TripInvitation.objects.select_for_update().get(pk=invitation_id)
        except TripInvitation.DoesNotExist:
            raise NotFound("Invitation not found.")

        if invitation.invitee != actor:
            raise PermissionDenied("Only the invitee can accept this invitation.")

        if invitation.status != InvitationStatus.PENDING:
            raise InvitationError("This invitation is no longer pending.")

        invitation.status = InvitationStatus.ACCEPTED
        invitation.responded_at = timezone.now()
        invitation.save(update_fields=["status", "responded_at"])

        membership = TripMember.objects.create(
            trip=invitation.trip,
            user=actor,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )

        create_notification(
            recipient=invitation.inviter,
            notification_type=NotificationType.TRIP_INVITATION_ACCEPTED,
            actor=actor,
            payload={
                "trip_id": str(invitation.trip_id),
                "trip_name": invitation.trip.name,
                "accepted_by_name": actor.display_name,
            },
        )

    return membership


def decline_invitation(invitation_id, actor) -> TripInvitation:
    """Decline a PENDING invitation."""
    from rest_framework.exceptions import NotFound, PermissionDenied

    with transaction.atomic():
        try:
            invitation = TripInvitation.objects.select_for_update().get(pk=invitation_id)
        except TripInvitation.DoesNotExist:
            raise NotFound("Invitation not found.")

        if invitation.invitee != actor:
            raise PermissionDenied("Only the invitee can decline this invitation.")

        if invitation.status != InvitationStatus.PENDING:
            raise InvitationError("This invitation is no longer pending.")

        invitation.status = InvitationStatus.DECLINED
        invitation.responded_at = timezone.now()
        invitation.save(update_fields=["status", "responded_at"])

        create_notification(
            recipient=invitation.inviter,
            notification_type=NotificationType.TRIP_INVITATION_DECLINED,
            actor=actor,
            payload={
                "trip_id": str(invitation.trip_id),
                "trip_name": invitation.trip.name,
                "declined_by_name": actor.display_name,
            },
        )

    return invitation


# -------- Captain action helpers --------

def _assert_captain(trip, actor):
    """Raise PermissionDenied if actor is not ACTIVE captain of trip."""
    from rest_framework.exceptions import PermissionDenied
    if not TripMember.objects.filter(trip=trip, user=actor, role=TripRole.CAPTAIN, status=MemberStatus.ACTIVE).exists():
        raise PermissionDenied("Only the trip captain can perform this action.")


def _assert_not_terminal(trip):
    """Raise StatusTransitionError if trip is in a terminal state."""
    if trip.status in (TripStatus.COMPLETED, TripStatus.CANCELLED):
        raise StatusTransitionError("This trip is in a terminal state. No further changes are allowed.")


def start_trip(trip_id, actor) -> Trip:
    """Transition PLANNING → ONGOING. Captain only."""
    from rest_framework.exceptions import NotFound

    with transaction.atomic():
        try:
            trip = Trip.objects.select_for_update().get(pk=trip_id)
        except Trip.DoesNotExist:
            raise NotFound("Trip not found.")

        _assert_captain(trip, actor)

        if trip.status != TripStatus.PLANNING:
            raise StatusTransitionError("Trip must be in PLANNING status to start.")

        trip.status = TripStatus.ONGOING
        trip.save(update_fields=["status", "updated_at"])

    return trip


def complete_trip(trip_id, actor) -> Trip:
    """Transition ONGOING → COMPLETED. Captain only."""
    from rest_framework.exceptions import NotFound

    with transaction.atomic():
        try:
            trip = Trip.objects.select_for_update().get(pk=trip_id)
        except Trip.DoesNotExist:
            raise NotFound("Trip not found.")

        _assert_captain(trip, actor)

        if trip.status != TripStatus.ONGOING:
            raise StatusTransitionError("Trip must be in ONGOING status to complete.")

        trip.status = TripStatus.COMPLETED
        trip.save(update_fields=["status", "updated_at"])

    return trip


def cancel_trip(trip_id, actor) -> Trip:
    """Transition PLANNING/ONGOING → CANCELLED. Captain only.
    Auto-cancels all PENDING invitations.
    Sends TRIP_CANCELLED notification to all ACTIVE members (excluding captain).
    """
    from rest_framework.exceptions import NotFound

    with transaction.atomic():
        try:
            trip = Trip.objects.select_for_update().get(pk=trip_id)
        except Trip.DoesNotExist:
            raise NotFound("Trip not found.")

        _assert_captain(trip, actor)

        if trip.status in (TripStatus.COMPLETED, TripStatus.CANCELLED):
            raise StatusTransitionError("This trip is already in a terminal state and cannot be cancelled.")

        trip.status = TripStatus.CANCELLED
        trip.cancelled_at = timezone.now()
        trip.save(update_fields=["status", "cancelled_at", "updated_at"])

        # Auto-cancel pending invitations
        TripInvitation.objects.filter(trip=trip, status=InvitationStatus.PENDING).update(
            status=InvitationStatus.CANCELLED
        )

        # Notify all active members (except captain)
        active_members = TripMember.objects.filter(
            trip=trip, status=MemberStatus.ACTIVE
        ).exclude(user=actor).select_related("user")

        for membership in active_members:
            create_notification(
                recipient=membership.user,
                notification_type=NotificationType.TRIP_CANCELLED,
                actor=actor,
                payload={
                    "trip_id": str(trip.id),
                    "trip_name": trip.name,
                },
            )

    return trip


def remove_member(trip_id, target_user_id, actor) -> TripMember:
    """Captain removes an ACTIVE member. Sets status to REMOVED, records left_at.
    Sends TRIP_MEMBER_REMOVED notification to the removed user.
    """
    from rest_framework.exceptions import NotFound, ValidationError

    with transaction.atomic():
        try:
            trip = Trip.objects.select_for_update().get(pk=trip_id)
        except Trip.DoesNotExist:
            raise NotFound("Trip not found.")

        _assert_captain(trip, actor)
        _assert_not_terminal(trip)

        # Captain cannot remove themselves
        if str(target_user_id) == str(actor.id):
            raise ValidationError({"detail": "You cannot remove yourself from the trip.", "error_code": "CANNOT_REMOVE_SELF"})

        try:
            membership = TripMember.objects.select_for_update().get(
                trip=trip, user_id=target_user_id, status=MemberStatus.ACTIVE
            )
        except TripMember.DoesNotExist:
            raise NotFound("Active member not found.")

        membership.status = MemberStatus.REMOVED
        membership.left_at = timezone.now()
        membership.save(update_fields=["status", "left_at"])

        create_notification(
            recipient=membership.user,
            notification_type=NotificationType.TRIP_MEMBER_REMOVED,
            actor=actor,
            payload={
                "trip_id": str(trip.id),
                "trip_name": trip.name,
            },
        )

    return membership
