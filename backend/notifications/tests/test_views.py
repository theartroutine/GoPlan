from __future__ import annotations

import uuid

from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from notifications.models import Notification, NotificationType
from test_helpers import create_verified_user
from trips.models import (
    InvitationStatus,
    MemberStatus,
    Trip,
    TripInvitation,
    TripMember,
    TripRole,
    TripStatus,
)

LIST_URL = "/api/notifications/"
UNREAD_COUNT_URL = "/api/notifications/unread-count"
MARK_ALL_READ_URL = "/api/notifications/read-all"


def _mark_read_url(notification_id):
    return f"/api/notifications/{notification_id}/read"


def _auth_header(user):
    token = AccessToken.for_user(user)
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def _make_trip(captain, *, status=TripStatus.PLANNING, name="Test Trip"):
    return Trip.objects.create(
        created_by=captain,
        name=name,
        destination="Da Nang",
        start_date="2026-05-01",
        end_date="2026-05-05",
        status=status,
    )


def _trip_invitation_payload(trip, invitation_id):
    return {
        "trip_id": str(trip.id),
        "trip_name": trip.name,
        "destination": trip.destination,
        "start_date": str(trip.start_date),
        "end_date": str(trip.end_date),
        "invitation_id": str(invitation_id),
    }


def _make_invitation_notification(
    *,
    trip,
    inviter,
    invitee,
    status=InvitationStatus.PENDING,
):
    invitation = TripInvitation.objects.create(
        trip=trip,
        inviter=inviter,
        invitee=invitee,
        status=status,
    )
    notification = Notification.objects.create(
        recipient=invitee,
        actor=inviter,
        type=NotificationType.TRIP_INVITATION,
        payload=_trip_invitation_payload(trip, invitation.id),
    )
    return invitation, notification


class NotificationListTests(APITestCase):

    def test_list_returns_only_own_notifications(self):
        user1 = create_verified_user()
        user2 = create_verified_user(email="other@example.com")
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
        user = create_verified_user()
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


class NotificationInvitationStatusTests(APITestCase):

    def setUp(self):
        self.recipient = create_verified_user(email="invitee@example.com")
        self.inviter = create_verified_user(email="captain@example.com")

    def _list_by_id(self):
        response = self.client.get(
            LIST_URL,
            **_auth_header(self.recipient),
        )
        self.assertEqual(response.status_code, 200)
        return {item["id"]: item for item in response.data["results"]}

    def test_list_adds_current_status_without_mutating_stored_payload(self):
        expected_by_notification_id = {}
        notifications = []

        for index, invitation_status in enumerate(InvitationStatus.values):
            trip = _make_trip(
                self.inviter,
                name=f"Trip {index}",
            )
            _invitation, notification = _make_invitation_notification(
                trip=trip,
                inviter=self.inviter,
                invitee=self.recipient,
                status=invitation_status,
            )
            notifications.append(notification)
            expected_by_notification_id[str(notification.id)] = invitation_status

        results = self._list_by_id()

        for notification_id, invitation_status in (
            expected_by_notification_id.items()
        ):
            self.assertEqual(
                results[notification_id]["payload"]["invitation_status"],
                invitation_status,
            )

        for notification in notifications:
            notification.refresh_from_db()
            self.assertNotIn("invitation_status", notification.payload)

    def test_pending_status_is_effectively_resolved_for_stale_invitations(self):
        terminal_trip = _make_trip(
            self.inviter,
            status=TripStatus.COMPLETED,
            name="Completed Trip",
        )
        _terminal_invitation, terminal_notification = (
            _make_invitation_notification(
                trip=terminal_trip,
                inviter=self.inviter,
                invitee=self.recipient,
            )
        )

        joined_trip = _make_trip(self.inviter, name="Already Joined Trip")
        _joined_invitation, joined_notification = _make_invitation_notification(
            trip=joined_trip,
            inviter=self.inviter,
            invitee=self.recipient,
        )
        TripMember.objects.create(
            trip=joined_trip,
            user=self.recipient,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )

        results = self._list_by_id()

        self.assertEqual(
            results[str(terminal_notification.id)]["payload"][
                "invitation_status"
            ],
            InvitationStatus.CANCELLED,
        )
        self.assertEqual(
            results[str(joined_notification.id)]["payload"][
                "invitation_status"
            ],
            InvitationStatus.ACCEPTED,
        )

    def test_invalid_or_foreign_references_share_neutral_payload(self):
        trip = _make_trip(self.inviter)
        own_invitation = TripInvitation.objects.create(
            trip=trip,
            inviter=self.inviter,
            invitee=self.recipient,
        )
        other_invitee = create_verified_user(email="other-invitee@example.com")
        foreign_invitation = TripInvitation.objects.create(
            trip=trip,
            inviter=self.inviter,
            invitee=other_invitee,
        )
        TripInvitation.objects.filter(pk=own_invitation.id).update(
            status="INVALID"
        )

        payloads = [
            _trip_invitation_payload(trip, own_invitation.id),
            _trip_invitation_payload(trip, uuid.uuid4()),
            _trip_invitation_payload(trip, foreign_invitation.id),
            {
                **_trip_invitation_payload(trip, own_invitation.id),
                "trip_id": str(uuid.uuid4()),
            },
            {
                **_trip_invitation_payload(trip, own_invitation.id),
                "invitation_id": "not-a-uuid",
            },
            {"invitation_id": str(own_invitation.id)},
            ["legacy", "payload"],
            {
                **_trip_invitation_payload(trip, own_invitation.id),
                "invitation_status": InvitationStatus.PENDING,
            },
        ]
        notifications = [
            Notification.objects.create(
                recipient=self.recipient,
                actor=self.inviter,
                type=NotificationType.TRIP_INVITATION,
                payload=payload,
            )
            for payload in payloads
        ]

        results = self._list_by_id()

        for notification in notifications:
            self.assertEqual(results[str(notification.id)]["payload"], {})

    def test_twenty_item_page_resolves_statuses_in_one_extra_query(self):
        for index in range(20):
            trip = _make_trip(self.inviter, name=f"Query Trip {index}")
            _make_invitation_notification(
                trip=trip,
                inviter=self.inviter,
                invitee=self.recipient,
            )

        self.client.force_authenticate(user=self.recipient)
        with self.assertNumQueries(2):
            response = self.client.get(LIST_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 20)
        self.assertTrue(
            all(
                item["payload"]["invitation_status"]
                == InvitationStatus.PENDING
                for item in response.data["results"]
            )
        )


class NotificationUnreadCountTests(APITestCase):

    def test_unread_count_correct(self):
        user = create_verified_user()
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
        user = create_verified_user()
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
        owner = create_verified_user()
        other = create_verified_user(email="other@example.com")
        notification = Notification.objects.create(
            recipient=owner, type=NotificationType.FRIEND_REQUEST
        )

        response = self.client.post(
            _mark_read_url(notification.id), **_auth_header(other)
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error_code"], "NOTIFICATION_NOT_FOUND")

    def test_mark_read_nonexistent_404(self):
        user = create_verified_user()
        fake_id = uuid.uuid4()

        response = self.client.post(
            _mark_read_url(fake_id), **_auth_header(user)
        )

        self.assertEqual(response.status_code, 404)


class NotificationMarkAllReadTests(APITestCase):

    def test_mark_all_read_returns_count(self):
        user = create_verified_user()
        Notification.objects.create(
            recipient=user, type=NotificationType.FRIEND_REQUEST
        )
        Notification.objects.create(
            recipient=user, type=NotificationType.FRIEND_ACCEPTED
        )

        response = self.client.post(MARK_ALL_READ_URL, **_auth_header(user))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["updated_count"], 2)
