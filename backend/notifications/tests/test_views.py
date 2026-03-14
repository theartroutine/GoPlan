from __future__ import annotations

import uuid

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from notifications.models import Notification, NotificationType

User = get_user_model()

LIST_URL = "/api/notifications/"
UNREAD_COUNT_URL = "/api/notifications/unread-count"
MARK_ALL_READ_URL = "/api/notifications/read-all"


def _mark_read_url(notification_id):
    return f"/api/notifications/{notification_id}/read"


def _create_verified_user(email="user@example.com", password="testpass123!"):
    user = User.objects.create_user(email=email, password=password)
    user.email_verified = True
    user.email_verified_at = timezone.now()
    user.save(update_fields=["email_verified", "email_verified_at"])
    return user


def _auth_header(user):
    token = AccessToken.for_user(user)
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


class NotificationListTests(APITestCase):

    def test_list_returns_only_own_notifications(self):
        user1 = _create_verified_user()
        user2 = _create_verified_user(email="other@example.com")
        Notification.objects.create(
            recipient=user1, type=NotificationType.FRIEND_REQUEST
        )
        Notification.objects.create(
            recipient=user2, type=NotificationType.FRIEND_REQUEST
        )

        response = self.client.get(LIST_URL, **_auth_header(user1))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)

    def test_list_paginated_newest_first(self):
        user = _create_verified_user()
        for i in range(25):
            Notification.objects.create(
                recipient=user, type=NotificationType.FRIEND_REQUEST
            )

        response = self.client.get(LIST_URL, **_auth_header(user))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 20)
        self.assertIsNotNone(response.data.get("next"))

    def test_list_requires_auth(self):
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, 401)


class NotificationUnreadCountTests(APITestCase):

    def test_unread_count_correct(self):
        user = _create_verified_user()
        Notification.objects.create(
            recipient=user, type=NotificationType.FRIEND_REQUEST
        )
        Notification.objects.create(
            recipient=user, type=NotificationType.FRIEND_ACCEPTED
        )
        Notification.objects.create(
            recipient=user,
            type=NotificationType.FRIEND_REQUEST,
            read_at=timezone.now(),
        )

        response = self.client.get(UNREAD_COUNT_URL, **_auth_header(user))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["unread_count"], 2)


class NotificationMarkReadTests(APITestCase):

    def test_mark_read_success_200(self):
        user = _create_verified_user()
        notification = Notification.objects.create(
            recipient=user, type=NotificationType.FRIEND_REQUEST
        )

        response = self.client.post(
            _mark_read_url(notification.id), **_auth_header(user)
        )

        self.assertEqual(response.status_code, 200)
        notification.refresh_from_db()
        self.assertIsNotNone(notification.read_at)

    def test_mark_read_wrong_user_404(self):
        owner = _create_verified_user()
        other = _create_verified_user(email="other@example.com")
        notification = Notification.objects.create(
            recipient=owner, type=NotificationType.FRIEND_REQUEST
        )

        response = self.client.post(
            _mark_read_url(notification.id), **_auth_header(other)
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error_code"], "NOTIFICATION_NOT_FOUND")

    def test_mark_read_nonexistent_404(self):
        user = _create_verified_user()
        fake_id = uuid.uuid4()

        response = self.client.post(
            _mark_read_url(fake_id), **_auth_header(user)
        )

        self.assertEqual(response.status_code, 404)


class NotificationMarkAllReadTests(APITestCase):

    def test_mark_all_read_returns_count(self):
        user = _create_verified_user()
        Notification.objects.create(
            recipient=user, type=NotificationType.FRIEND_REQUEST
        )
        Notification.objects.create(
            recipient=user, type=NotificationType.FRIEND_ACCEPTED
        )

        response = self.client.post(MARK_ALL_READ_URL, **_auth_header(user))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["updated_count"], 2)
