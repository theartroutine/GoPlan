from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Prefetch, Q
from django.utils import timezone

from friends.models import Friendship
from notifications.models import NotificationType
from notifications.services import create_notification
from trips.models import InvitationStatus, MemberStatus, Trip, TripInvitation, TripMember, TripRole, TripStatus

User = get_user_model()


# -------- Exceptions --------

class TripServiceError(Exception):
    """Base exception for trip service layer."""
    error_code: str = "TRIP_ERROR"


class TripNotFoundError(TripServiceError):
    error_code = "TRIP_NOT_FOUND"


class NotTripMemberError(TripServiceError):
    error_code = "NOT_TRIP_MEMBER"


class TripPermissionError(TripServiceError):
    error_code = "PERMISSION_DENIED"


class CannotRemoveSelfError(TripServiceError):
    error_code = "CANNOT_REMOVE_SELF"


class CaptainCannotLeaveError(TripServiceError):
    error_code = "CAPTAIN_CANNOT_LEAVE"


class InviteError(TripServiceError):
    error_code = "INVITE_ERROR"


class NotFriendError(InviteError):
    error_code = "NOT_FRIEND"


class AlreadyMemberError(InviteError):
    error_code = "ALREADY_MEMBER"


class AlreadyInvitedError(InviteError):
    error_code = "ALREADY_INVITED"


class InvitationError(TripServiceError):
    error_code = "INVITATION_ERROR"


class StatusTransitionError(TripServiceError):
    error_code = "INVALID_STATUS_TRANSITION"


class TripTerminalError(StatusTransitionError):
    error_code = "TRIP_TERMINAL"


# -------- Services --------

def create_trip(
    *,
    captain,
    name: str,
    destination: str,
    destination_provider: str = "",
    destination_provider_id: str = "",
    destination_lat=None,
    destination_lng=None,
    destination_country_code: str = "",
    cover_image_url: str = "",
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
            destination_provider=destination_provider,
            destination_provider_id=destination_provider_id,
            destination_lat=destination_lat,
            destination_lng=destination_lng,
            destination_country_code=destination_country_code,
            cover_image_url=cover_image_url,
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
    active_memberships = TripMember.objects.filter(status=MemberStatus.ACTIVE)
    return (
        Trip.objects.filter(memberships__user=user, memberships__status=MemberStatus.ACTIVE)
        .prefetch_related(Prefetch("memberships", queryset=active_memberships))
        .order_by("-created_at")
        .distinct()
    )


def get_trip_detail(trip_id, requesting_user):
    """Return (trip, my_membership) or raise 404/403."""
    try:
        trip = Trip.objects.get(pk=trip_id)
    except Trip.DoesNotExist:
        raise TripNotFoundError("Trip not found.")
    membership = TripMember.objects.filter(
        trip=trip, user=requesting_user, status=MemberStatus.ACTIVE
    ).first()
    if not membership:
        raise NotTripMemberError("You are not a member of this trip.")
    return trip, membership


_UNSET = object()


def update_trip(trip, *, name=_UNSET, destination=_UNSET,
                destination_provider=_UNSET, destination_provider_id=_UNSET, destination_lat=_UNSET,
                destination_lng=_UNSET, destination_country_code=_UNSET,
                cover_image_url=_UNSET,
                start_date=_UNSET, end_date=_UNSET,
                description=_UNSET, currency_code=_UNSET, budget_estimate=_UNSET):
    """Partially update trip fields. Only updates fields explicitly passed.
    Sentinel _UNSET distinguishes "not provided" from None (which clears a nullable field).
    """
    if name is not _UNSET:                       trip.name = name
    if destination is not _UNSET:                trip.destination = destination
    if destination_provider is not _UNSET:       trip.destination_provider = destination_provider
    if destination_provider_id is not _UNSET:    trip.destination_provider_id = destination_provider_id
    if destination_lat is not _UNSET:            trip.destination_lat = destination_lat
    if destination_lng is not _UNSET:            trip.destination_lng = destination_lng
    if destination_country_code is not _UNSET:   trip.destination_country_code = destination_country_code
    if cover_image_url is not _UNSET:            trip.cover_image_url = cover_image_url
    if start_date is not _UNSET:                 trip.start_date = start_date
    if end_date is not _UNSET:                   trip.end_date = end_date
    if description is not _UNSET:                trip.description = description
    if currency_code is not _UNSET:              trip.currency_code = currency_code
    if budget_estimate is not _UNSET:            trip.budget_estimate = budget_estimate
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

    invitees = list(User.objects.filter(pk__in=invitee_ids, is_profile_completed=True))
    if len(invitees) != len(invitee_ids):
        raise InviteError("One or more users not found.")

    created = []
    with transaction.atomic():
        try:
            locked_trip = Trip.objects.select_for_update().get(pk=trip.pk)
        except Trip.DoesNotExist:
            raise TripNotFoundError("Trip not found.")

        if locked_trip.status in (TripStatus.COMPLETED, TripStatus.CANCELLED):
            raise InviteError("Cannot invite members to a trip that is completed or cancelled.")

        for invitee in invitees:
            if invitee == captain:
                raise InviteError("Cannot invite yourself.")

            if not _are_friends(captain, invitee):
                raise NotFriendError("Cannot invite this user.")

            if locked_trip.memberships.filter(user=invitee, status=MemberStatus.ACTIVE).exists():
                raise AlreadyMemberError("Cannot invite this user.")

            if locked_trip.invitations.filter(invitee=invitee, status=InvitationStatus.PENDING).exists():
                raise AlreadyInvitedError("Cannot invite this user.")

            try:
                inv = TripInvitation.objects.create(
                    trip=locked_trip,
                    inviter=captain,
                    invitee=invitee,
                    status=InvitationStatus.PENDING,
                )
            except IntegrityError as exc:
                raise AlreadyInvitedError("Cannot invite this user.") from exc
            created.append(inv)

            create_notification(
                recipient=invitee,
                notification_type=NotificationType.TRIP_INVITATION,
                actor=captain,
                payload={
                    "trip_id": str(locked_trip.id),
                    "trip_name": locked_trip.name,
                    "destination": locked_trip.destination,
                    "start_date": str(locked_trip.start_date),
                    "end_date": str(locked_trip.end_date),
                    "invitation_id": str(inv.id),
                },
            )

    return created


def accept_invitation(invitation_id, actor) -> TripMember:
    """Accept a PENDING invitation. Creates ACTIVE TripMember for invitee."""
    with transaction.atomic():
        try:
            invitation_trip_id = TripInvitation.objects.values_list("trip_id", flat=True).get(pk=invitation_id)
        except TripInvitation.DoesNotExist:
            raise TripNotFoundError("Invitation not found.")

        try:
            trip = Trip.objects.select_for_update().get(pk=invitation_trip_id)
        except Trip.DoesNotExist:
            raise TripNotFoundError("Trip not found.")

        try:
            invitation = TripInvitation.objects.select_for_update().select_related("inviter").get(pk=invitation_id)
        except TripInvitation.DoesNotExist:
            raise TripNotFoundError("Invitation not found.")

        if invitation.invitee != actor:
            raise TripPermissionError("Only the invitee can accept this invitation.")

        if invitation.status != InvitationStatus.PENDING:
            raise InvitationError("This invitation is no longer pending.")

        if trip.status in (TripStatus.COMPLETED, TripStatus.CANCELLED):
            raise InvitationError("This trip is no longer open to new members.")

        invitation.status = InvitationStatus.ACCEPTED
        invitation.responded_at = timezone.now()
        invitation.save(update_fields=["status", "responded_at"])

        membership = TripMember.objects.create(
            trip=trip,
            user=actor,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )

        create_notification(
            recipient=invitation.inviter,
            notification_type=NotificationType.TRIP_INVITATION_ACCEPTED,
            actor=actor,
            payload={
                "trip_id": str(trip.id),
                "trip_name": trip.name,
                "accepted_by_name": actor.display_name,
            },
        )

    return membership


def decline_invitation(invitation_id, actor) -> TripInvitation:
    """Decline a PENDING invitation."""
    with transaction.atomic():
        try:
            invitation = TripInvitation.objects.select_for_update().get(pk=invitation_id)
        except TripInvitation.DoesNotExist:
            raise TripNotFoundError("Invitation not found.")

        if invitation.invitee != actor:
            raise TripPermissionError("Only the invitee can decline this invitation.")

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
    """Raise TripPermissionError if actor is not ACTIVE captain of trip."""
    if not TripMember.objects.filter(trip=trip, user=actor, role=TripRole.CAPTAIN, status=MemberStatus.ACTIVE).exists():
        raise TripPermissionError("Only the trip captain can perform this action.")


def _assert_not_terminal(trip):
    """Raise TripTerminalError if trip is in a terminal state."""
    if trip.status in (TripStatus.COMPLETED, TripStatus.CANCELLED):
        raise TripTerminalError("This trip is in a terminal state. No further changes are allowed.")


def start_trip(trip_id, actor) -> Trip:
    """Transition PLANNING → ONGOING. Captain only."""
    with transaction.atomic():
        try:
            trip = Trip.objects.select_for_update().get(pk=trip_id)
        except Trip.DoesNotExist:
            raise TripNotFoundError("Trip not found.")

        _assert_captain(trip, actor)

        if trip.status != TripStatus.PLANNING:
            raise StatusTransitionError("Trip must be in PLANNING status to start.")

        trip.status = TripStatus.ONGOING
        trip.save(update_fields=["status", "updated_at"])

    return trip


def complete_trip(trip_id, actor) -> Trip:
    """Transition ONGOING → COMPLETED. Captain only.
    Auto-cancels any remaining PENDING invitations so a terminal trip
    cannot acquire new members through a stale invite.
    """
    with transaction.atomic():
        try:
            trip = Trip.objects.select_for_update().get(pk=trip_id)
        except Trip.DoesNotExist:
            raise TripNotFoundError("Trip not found.")

        _assert_captain(trip, actor)

        if trip.status != TripStatus.ONGOING:
            raise StatusTransitionError("Trip must be in ONGOING status to complete.")

        trip.status = TripStatus.COMPLETED
        trip.save(update_fields=["status", "updated_at"])

        TripInvitation.objects.filter(trip=trip, status=InvitationStatus.PENDING).update(
            status=InvitationStatus.CANCELLED
        )

    return trip


def cancel_trip(trip_id, actor) -> Trip:
    """Transition PLANNING/ONGOING → CANCELLED. Captain only.
    Auto-cancels all PENDING invitations.
    Sends TRIP_CANCELLED notification to all ACTIVE members (excluding captain).
    """
    with transaction.atomic():
        try:
            trip = Trip.objects.select_for_update().get(pk=trip_id)
        except Trip.DoesNotExist:
            raise TripNotFoundError("Trip not found.")

        _assert_captain(trip, actor)

        if trip.status in (TripStatus.COMPLETED, TripStatus.CANCELLED):
            raise TripTerminalError("This trip is already in a terminal state and cannot be cancelled.")

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
    with transaction.atomic():
        try:
            trip = Trip.objects.select_for_update().get(pk=trip_id)
        except Trip.DoesNotExist:
            raise TripNotFoundError("Trip not found.")

        _assert_captain(trip, actor)
        _assert_not_terminal(trip)

        # Captain cannot remove themselves
        if str(target_user_id) == str(actor.id):
            raise CannotRemoveSelfError("You cannot remove yourself from the trip.")

        try:
            membership = TripMember.objects.select_for_update().get(
                trip=trip, user_id=target_user_id, status=MemberStatus.ACTIVE
            )
        except TripMember.DoesNotExist:
            raise TripNotFoundError("Active member not found.")

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


# -------- Member leave helpers --------

def leave_trip(trip_id, actor) -> TripMember:
    """Actor voluntarily leaves the trip. Sets membership status to LEFT, records left_at.
    Captain cannot leave (no transfer mechanism in Phase 1).
    Only allowed when trip is PLANNING or ONGOING.
    Actor must be an ACTIVE member.
    """
    with transaction.atomic():
        try:
            trip = Trip.objects.select_for_update().get(pk=trip_id)
        except Trip.DoesNotExist:
            raise TripNotFoundError("Trip not found.")

        # Check actor is an active member of this trip
        try:
            membership = TripMember.objects.select_for_update().get(
                trip=trip, user=actor, status=MemberStatus.ACTIVE
            )
        except TripMember.DoesNotExist:
            raise NotTripMemberError("You are not an active member of this trip.")

        # Terminal state guard — checked first for consistent ordering with other services
        if trip.status in (TripStatus.COMPLETED, TripStatus.CANCELLED):
            raise TripTerminalError("Cannot leave a trip that is completed or cancelled.")

        # Captain cannot leave
        if membership.role == TripRole.CAPTAIN:
            raise CaptainCannotLeaveError("Captain cannot leave the trip. Transfer captaincy first (not available in Phase 1).")

        membership.status = MemberStatus.LEFT
        membership.left_at = timezone.now()
        membership.save(update_fields=["status", "left_at"])

    return membership
