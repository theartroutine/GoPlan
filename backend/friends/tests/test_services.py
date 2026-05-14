from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from friends.models import FriendRequest, FriendRequestStatus, Friendship
from friends.services import (
    FRIEND_LIMIT,
    AlreadyFriendsError,
    DuplicatePendingRequestError,
    FriendLimitReachedError,
    FriendRequestNotFoundError,
    InvalidRequestStateError,
    SelfRequestError,
    UserNotFoundError,
    accept_friend_request,
    cancel_friend_request,
    decline_friend_request,
    remove_friendship,
    search_user_by_identify_tag,
    send_friend_request,
)
from notifications.models import Notification, NotificationType
from test_helpers import create_completed_user

User = get_user_model()


# -------- Lifecycle Tests --------


class FriendRequestLifecycleTests(APITestCase):

    def setUp(self):
        self.alice = create_completed_user("alice@example.com", "alice", "ABC123")
        self.bob = create_completed_user("bob@example.com", "bob", "DEF456")

    def test_send_accept_creates_friendship(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        self.assertEqual(fr.status, FriendRequestStatus.PENDING)

        friendship = accept_friend_request(fr.id, self.bob)
        self.assertIsNotNone(friendship)

        fr.refresh_from_db()
        self.assertEqual(fr.status, FriendRequestStatus.ACCEPTED)
        self.assertIsNotNone(fr.resolved_at)

        # Canonical pair check
        low, high = sorted([self.alice.pk, self.bob.pk])
        self.assertEqual(friendship.user_low.pk, low)
        self.assertEqual(friendship.user_high.pk, high)

    def test_send_decline_allows_resend(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        decline_friend_request(fr.id, self.bob)

        fr2 = send_friend_request(self.alice, "bob#DEF456")
        self.assertEqual(fr2.status, FriendRequestStatus.PENDING)
        self.assertNotEqual(fr.id, fr2.id)

    def test_send_cancel(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        result = cancel_friend_request(fr.id, self.alice)
        self.assertEqual(result.status, FriendRequestStatus.CANCELLED)

        # Can resend after cancel
        fr2 = send_friend_request(self.alice, "bob#DEF456")
        self.assertEqual(fr2.status, FriendRequestStatus.PENDING)


# -------- Business Rule Tests --------


class FriendRequestBusinessRuleTests(APITestCase):

    def setUp(self):
        self.alice = create_completed_user("alice@example.com", "alice", "ABC123")
        self.bob = create_completed_user("bob@example.com", "bob", "DEF456")

    def test_send_self_request_raises(self):
        with self.assertRaises(SelfRequestError):
            send_friend_request(self.alice, "alice#ABC123")

    def test_send_duplicate_pending_same_direction_raises(self):
        send_friend_request(self.alice, "bob#DEF456")
        with self.assertRaises(DuplicatePendingRequestError):
            send_friend_request(self.alice, "bob#DEF456")

    def test_send_duplicate_pending_reverse_direction_raises(self):
        send_friend_request(self.alice, "bob#DEF456")
        with self.assertRaises(DuplicatePendingRequestError):
            send_friend_request(self.bob, "alice#ABC123")

    def test_send_already_friends_raises(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        accept_friend_request(fr.id, self.bob)

        with self.assertRaises(AlreadyFriendsError):
            send_friend_request(self.alice, "bob#DEF456")

    def test_send_user_not_found_raises(self):
        with self.assertRaises(UserNotFoundError):
            send_friend_request(self.alice, "nobody#ZZZ999")

    def test_accept_friend_limit_receiver(self):
        # Create 500 friends for bob
        for i in range(FRIEND_LIMIT):
            other = create_completed_user(
                f"other{i}@example.com", f"other{i:04d}", f"{i:06d}"[-6:]
            )
            low, high = sorted([self.bob.pk, other.pk])
            u_low = self.bob if self.bob.pk == low else other
            u_high = other if self.bob.pk == low else self.bob
            Friendship.objects.create(user_low=u_low, user_high=u_high)

        # Create request directly — send_friend_request also checks limits now
        fr = FriendRequest.objects.create(
            sender=self.alice, receiver=self.bob, status=FriendRequestStatus.PENDING
        )
        with self.assertRaises(FriendLimitReachedError):
            accept_friend_request(fr.id, self.bob)

    def test_accept_friend_limit_sender(self):
        # Create 500 friends for alice
        for i in range(FRIEND_LIMIT):
            other = create_completed_user(
                f"other{i}@example.com", f"other{i:04d}", f"{i:06d}"[-6:]
            )
            low, high = sorted([self.alice.pk, other.pk])
            u_low = self.alice if self.alice.pk == low else other
            u_high = other if self.alice.pk == low else self.alice
            Friendship.objects.create(user_low=u_low, user_high=u_high)

        # Create request directly — send_friend_request also checks limits now
        fr = FriendRequest.objects.create(
            sender=self.alice, receiver=self.bob, status=FriendRequestStatus.PENDING
        )
        with self.assertRaises(FriendLimitReachedError):
            accept_friend_request(fr.id, self.bob)


# -------- Permission Tests --------


class FriendRequestPermissionTests(APITestCase):

    def setUp(self):
        self.alice = create_completed_user("alice@example.com", "alice", "ABC123")
        self.bob = create_completed_user("bob@example.com", "bob", "DEF456")
        self.charlie = create_completed_user("charlie@example.com", "charlie", "GHI789")

    def test_accept_by_non_receiver_raises(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        with self.assertRaises(FriendRequestNotFoundError):
            accept_friend_request(fr.id, self.charlie)

    def test_decline_by_non_receiver_raises(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        with self.assertRaises(FriendRequestNotFoundError):
            decline_friend_request(fr.id, self.charlie)

    def test_cancel_by_non_sender_raises(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        with self.assertRaises(FriendRequestNotFoundError):
            cancel_friend_request(fr.id, self.bob)

    def test_accept_already_accepted_raises(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        accept_friend_request(fr.id, self.bob)
        with self.assertRaises(InvalidRequestStateError):
            accept_friend_request(fr.id, self.bob)


# -------- DB Constraint Tests --------


class BilateralPendingConstraintTests(TransactionTestCase):

    def setUp(self):
        self.alice = create_completed_user("alice@example.com", "alice", "ABC123")
        self.bob = create_completed_user("bob@example.com", "bob", "DEF456")

    def test_db_rejects_bilateral_pending_via_orm(self):
        FriendRequest.objects.create(
            sender=self.alice,
            receiver=self.bob,
            status=FriendRequestStatus.PENDING,
        )
        with self.assertRaises(IntegrityError):
            FriendRequest.objects.create(
                sender=self.bob,
                receiver=self.alice,
                status=FriendRequestStatus.PENDING,
            )

    def test_db_allows_reverse_after_resolve(self):
        fr = FriendRequest.objects.create(
            sender=self.alice,
            receiver=self.bob,
            status=FriendRequestStatus.PENDING,
        )
        fr.status = FriendRequestStatus.DECLINED
        fr.resolved_at = timezone.now()
        fr.save()

        # Reverse direction should now be allowed
        fr2 = FriendRequest.objects.create(
            sender=self.bob,
            receiver=self.alice,
            status=FriendRequestStatus.PENDING,
        )
        self.assertEqual(fr2.status, FriendRequestStatus.PENDING)


# -------- Search Tests --------


class SearchTests(APITestCase):

    def setUp(self):
        self.alice = create_completed_user("alice@example.com", "alice", "ABC123")
        self.bob = create_completed_user("bob@example.com", "bob", "DEF456")

    def test_search_exact_match(self):
        result = search_user_by_identify_tag("bob#DEF456", self.alice)
        self.assertIsNotNone(result)
        self.assertEqual(result["display_name"], "Test User")
        self.assertEqual(result["identify_tag"], "bob#DEF456")
        self.assertNotIn("email", result)

    def test_search_no_match(self):
        result = search_user_by_identify_tag("nobody#ZZZ999", self.alice)
        self.assertIsNone(result)

    def test_search_self_returns_none(self):
        result = search_user_by_identify_tag("alice#ABC123", self.alice)
        self.assertIsNone(result)

    def test_search_profile_not_completed_returns_none(self):
        incomplete = User.objects.create_user(
            email="incomplete@example.com", password="testpass123!"
        )
        incomplete.email_verified = True
        incomplete.identify_name = "incomplete"
        incomplete.identify_code = "ZZZ999"
        incomplete.save()

        result = search_user_by_identify_tag("incomplete#ZZZ999", self.alice)
        self.assertIsNone(result)


# -------- Notification Integration Tests --------


class NotificationIntegrationTests(TransactionTestCase):

    def setUp(self):
        self.alice = create_completed_user("alice@example.com", "alice", "ABC123")
        self.bob = create_completed_user("bob@example.com", "bob", "DEF456")

    def test_send_creates_friend_request_notification(self):
        send_friend_request(self.alice, "bob#DEF456")

        notifications = Notification.objects.filter(
            recipient=self.bob, type=NotificationType.FRIEND_REQUEST
        )
        self.assertEqual(notifications.count(), 1)
        self.assertEqual(notifications.first().actor, self.alice)

    def test_accept_creates_friend_accepted_notification(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        accept_friend_request(fr.id, self.bob)

        notifications = Notification.objects.filter(
            recipient=self.alice, type=NotificationType.FRIEND_ACCEPTED
        )
        self.assertEqual(notifications.count(), 1)
        self.assertEqual(notifications.first().actor, self.bob)

    def test_decline_no_notification(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        initial_count = Notification.objects.count()
        decline_friend_request(fr.id, self.bob)
        self.assertEqual(Notification.objects.count(), initial_count)

    def test_cancel_no_notification(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        initial_count = Notification.objects.count()
        cancel_friend_request(fr.id, self.alice)
        self.assertEqual(Notification.objects.count(), initial_count)


# -------- Friend User Payload avatar_url --------

import io
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image as PILImage
from django.test import TestCase
from accounts.services import update_avatar
from friends.serializers import _build_friend_user_payload


class FriendUserPayloadAvatarUrlTests(TestCase):
    def test_payload_avatar_url_is_null_when_no_avatar(self):
        user = User.objects.create_user(email="fa@example.com", password="Pw1234567!")
        payload = _build_friend_user_payload(user)
        self.assertIn("avatar_url", payload)
        self.assertIsNone(payload["avatar_url"])

    def test_payload_avatar_url_is_storage_url_when_present(self):
        user = User.objects.create_user(email="fb@example.com", password="Pw1234567!")
        buf = io.BytesIO()
        PILImage.new("RGB", (256, 256), "red").save(buf, format="JPEG")
        update_avatar(
            user,
            SimpleUploadedFile("a.jpg", buf.getvalue(), content_type="image/jpeg"),
        )
        payload = _build_friend_user_payload(user)
        self.assertTrue(payload["avatar_url"].startswith("/media/avatars/"))
