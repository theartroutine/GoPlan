from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounts.services import resolve_avatar_url
from friends.models import FriendRequest, FriendRequestStatus, Friendship
from friends.validators import parse_identify_tag
from notifications.models import NotificationType
from notifications.services import create_notification
from shared.utils.identity import canonical_pair

User = get_user_model()


# -------- Exceptions --------


class FriendServiceError(Exception):
    pass


class SelfRequestError(FriendServiceError):
    pass


class DuplicatePendingRequestError(FriendServiceError):
    pass


class AlreadyFriendsError(FriendServiceError):
    pass


class FriendLimitReachedError(FriendServiceError):
    pass


class UserNotFoundError(FriendServiceError):
    pass


class FriendRequestNotFoundError(FriendServiceError):
    pass


class FriendshipNotFoundError(FriendServiceError):
    pass


class InvalidRequestStateError(FriendServiceError):
    pass


class NotRequestParticipantError(FriendServiceError):
    pass


class NotFriendshipParticipantError(FriendServiceError):
    pass


# -------- Constants --------

FRIEND_LIMIT = 500


# -------- Helpers --------


def _are_friends(user_a, user_b):
    """Check if two users are already friends."""
    low, high = canonical_pair(user_a, user_b)
    return Friendship.objects.filter(user_low=low, user_high=high).exists()


def _friend_count(user):
    """Count total friendships for a user."""
    return Friendship.objects.filter(
        Q(user_low=user) | Q(user_high=user)
    ).count()


def _friend_count_locked(user):
    """Count total friendships for a user using a locking query.

    Must be called inside a transaction.atomic() scope after _lock_user_pair()
    so concurrent accept operations involving this user cannot race the limit
    check.
    """
    return Friendship.objects.select_for_update().filter(
        Q(user_low=user) | Q(user_high=user)
    ).count()


def _lock_user_pair(user_a, user_b):
    """Lock two User rows in deterministic order to prevent deadlocks."""
    sorted_ids = sorted([user_a.pk, user_b.pk])
    locked = list(
        User.objects.select_for_update()
        .filter(pk__in=sorted_ids)
        .order_by("pk")
    )
    return locked[0], locked[1]


def _resolve_user_by_identify_tag(query):
    """Resolve a user by identify_tag string. Returns User or None."""
    try:
        identify_name, identify_code = parse_identify_tag(query)
    except ValueError:
        return None

    return User.objects.filter(
        identify_name=identify_name,
        identify_code=identify_code,
        is_profile_completed=True,
        email_verified=True,
    ).first()


# -------- Public API --------


def search_user_by_identify_tag(query, requester):
    """Search for a user by identify_tag. Returns dict or None."""
    user = _resolve_user_by_identify_tag(query)
    if user is None or user == requester:
        return None
    return {
        "id": str(user.id),
        "display_name": user.display_name,
        "identify_tag": user.identify_tag,
        "avatar_url": resolve_avatar_url(user),
    }


def send_friend_request(sender, identify_tag):
    """Send a friend request by identify_tag."""
    receiver = _resolve_user_by_identify_tag(identify_tag)
    if receiver is None:
        raise UserNotFoundError("User not found.")

    if sender == receiver:
        raise SelfRequestError("You cannot send a friend request to yourself.")

    with transaction.atomic():
        _lock_user_pair(sender, receiver)

        if _are_friends(sender, receiver):
            raise AlreadyFriendsError("You are already friends with this user.")

        has_pending = FriendRequest.objects.filter(
            Q(sender=sender, receiver=receiver)
            | Q(sender=receiver, receiver=sender),
            status=FriendRequestStatus.PENDING,
        ).exists()
        if has_pending:
            raise DuplicatePendingRequestError(
                "A pending friend request already exists between you and this user."
            )

        if _friend_count(sender) >= FRIEND_LIMIT:
            raise FriendLimitReachedError(
                "You have reached the maximum number of friends."
            )
        if _friend_count(receiver) >= FRIEND_LIMIT:
            raise FriendLimitReachedError(
                "This user has reached the maximum number of friends."
            )

        friend_request = FriendRequest.objects.create(
            sender=sender,
            receiver=receiver,
            status=FriendRequestStatus.PENDING,
        )

        create_notification(
            recipient=receiver,
            notification_type=NotificationType.FRIEND_REQUEST,
            actor=sender,
        )

    return friend_request


def accept_friend_request(friend_request_id, actor):
    """Accept a pending friend request."""
    with transaction.atomic():
        try:
            fr = FriendRequest.objects.select_for_update().get(
                pk=friend_request_id,
                receiver=actor,
            )
        except FriendRequest.DoesNotExist:
            raise FriendRequestNotFoundError("Friend request not found.")

        if fr.status != FriendRequestStatus.PENDING:
            raise InvalidRequestStateError(
                "This friend request is no longer pending."
            )

        _lock_user_pair(fr.sender, fr.receiver)

        if _friend_count_locked(fr.sender) >= FRIEND_LIMIT:
            raise FriendLimitReachedError(
                "The sender has reached the maximum number of friends."
            )
        if _friend_count_locked(fr.receiver) >= FRIEND_LIMIT:
            raise FriendLimitReachedError(
                "You have reached the maximum number of friends."
            )

        if _are_friends(fr.sender, fr.receiver):
            raise AlreadyFriendsError("You are already friends with this user.")

        fr.status = FriendRequestStatus.ACCEPTED
        fr.resolved_at = timezone.now()
        fr.save(update_fields=["status", "resolved_at", "updated_at"])

        low, high = canonical_pair(fr.sender, fr.receiver)
        friendship = Friendship.objects.create(user_low=low, user_high=high)

        create_notification(
            recipient=fr.sender,
            notification_type=NotificationType.FRIEND_ACCEPTED,
            actor=fr.receiver,
        )

    return friendship


def decline_friend_request(friend_request_id, actor):
    """Decline a pending friend request."""
    with transaction.atomic():
        try:
            fr = FriendRequest.objects.select_for_update().get(
                pk=friend_request_id,
                receiver=actor,
            )
        except FriendRequest.DoesNotExist:
            raise FriendRequestNotFoundError("Friend request not found.")

        if fr.status != FriendRequestStatus.PENDING:
            raise InvalidRequestStateError(
                "This friend request is no longer pending."
            )

        fr.status = FriendRequestStatus.DECLINED
        fr.resolved_at = timezone.now()
        fr.save(update_fields=["status", "resolved_at", "updated_at"])

    return fr


def cancel_friend_request(friend_request_id, actor):
    """Cancel a pending friend request."""
    with transaction.atomic():
        try:
            fr = FriendRequest.objects.select_for_update().get(
                pk=friend_request_id,
                sender=actor,
            )
        except FriendRequest.DoesNotExist:
            raise FriendRequestNotFoundError("Friend request not found.")

        if fr.status != FriendRequestStatus.PENDING:
            raise InvalidRequestStateError(
                "This friend request is no longer pending."
            )

        fr.status = FriendRequestStatus.CANCELLED
        fr.resolved_at = timezone.now()
        fr.save(update_fields=["status", "resolved_at", "updated_at"])

    return fr


def remove_friendship(friendship_id, actor):
    """Remove an existing friendship."""
    with transaction.atomic():
        try:
            friendship = Friendship.objects.select_for_update().get(
                Q(user_low=actor) | Q(user_high=actor),
                pk=friendship_id,
            )
        except Friendship.DoesNotExist:
            raise FriendshipNotFoundError("Friendship not found.")

        friendship.delete()
