from __future__ import annotations

from unittest.mock import patch

from django.core.cache import cache as throttle_cache
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from friends.models import Friendship
from test_helpers import create_completed_user
from trips.models import InvitationStatus, MemberStatus, Trip, TripInvitation, TripMember, TripRole, TripStatus


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _make_friendship(u1, u2):
    low, high = (u1, u2) if str(u1.pk) < str(u2.pk) else (u2, u1)
    return Friendship.objects.create(user_low=low, user_high=high)


def _make_trip(captain):
    trip = Trip.objects.create(
        created_by=captain,
        name="T",
        destination="D",
        start_date="2026-06-01",
        end_date="2026-06-05",
        status=TripStatus.PLANNING,
    )
    TripMember.objects.create(trip=trip, user=captain, role=TripRole.CAPTAIN, status=MemberStatus.ACTIVE)
    return trip


def _invite_url(trip_id):
    return f"/api/trips/{trip_id}/invitations"


def _invitable_url(trip_id):
    return f"/api/trips/{trip_id}/invitations/invitable-friends"


class SendInvitationTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("cap@example.com", "captain", "CAP001")
        self.friend1 = create_completed_user("f1@example.com", "friend1", "F1_001")
        self.friend2 = create_completed_user("f2@example.com", "friend2", "F2_001")
        self.stranger = create_completed_user("str@example.com", "stranger", "STR001")
        self.trip = _make_trip(self.captain)
        _make_friendship(self.captain, self.friend1)
        _make_friendship(self.captain, self.friend2)

    def test_captain_can_invite_friends_201(self):
        res = self.client.post(
            _invite_url(self.trip.id),
            {"invitee_ids": [str(self.friend1.id), str(self.friend2.id)]},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(TripInvitation.objects.filter(trip=self.trip, status=InvitationStatus.PENDING).count(), 2)

    def test_cannot_invite_non_friend_400(self):
        res = self.client.post(
            _invite_url(self.trip.id),
            {"invitee_ids": [str(self.stranger.id)]},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("error_code", res.data)

    def test_cannot_invite_existing_member_400(self):
        TripMember.objects.create(trip=self.trip, user=self.friend1, role=TripRole.MEMBER, status=MemberStatus.ACTIVE)
        res = self.client.post(
            _invite_url(self.trip.id),
            {"invitee_ids": [str(self.friend1.id)]},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)

    def test_duplicate_pending_invite_400(self):
        TripInvitation.objects.create(
            trip=self.trip,
            inviter=self.captain,
            invitee=self.friend1,
            status=InvitationStatus.PENDING,
        )
        res = self.client.post(
            _invite_url(self.trip.id),
            {"invitee_ids": [str(self.friend1.id)]},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)

    def test_non_captain_cannot_invite_403(self):
        TripMember.objects.create(trip=self.trip, user=self.friend1, role=TripRole.MEMBER, status=MemberStatus.ACTIVE)
        res = self.client.post(
            _invite_url(self.trip.id),
            {"invitee_ids": [str(self.friend2.id)]},
            format="json",
            **_auth(self.friend1),
        )
        self.assertEqual(res.status_code, 403)

    def test_cannot_invite_to_cancelled_trip_400(self):
        self.trip.status = TripStatus.CANCELLED
        self.trip.save(update_fields=["status"])
        res = self.client.post(
            _invite_url(self.trip.id),
            {"invitee_ids": [str(self.friend1.id)]},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("error_code", res.data)

    def test_cannot_invite_to_completed_trip_400(self):
        self.trip.status = TripStatus.COMPLETED
        self.trip.save(update_fields=["status"])
        res = self.client.post(
            _invite_url(self.trip.id),
            {"invitee_ids": [str(self.friend1.id)]},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("error_code", res.data)

    def test_duplicate_invitee_ids_400(self):
        res = self.client.post(
            _invite_url(self.trip.id),
            {"invitee_ids": [str(self.friend1.id), str(self.friend1.id)]},
            format="json",
            **_auth(self.captain),
        )
        self.assertEqual(res.status_code, 400)
        self.assertNotIn("One or more users not found", str(res.data))

    def test_listing_invitations_does_not_consume_send_invitation_quota(self):
        throttle_cache.clear()
        rates = {
            **ScopedRateThrottle.THROTTLE_RATES,
            "trips_send_invitations": "1/hour",
            "trips_invitations_list": "120/hour",
        }

        with patch.object(ScopedRateThrottle, "THROTTLE_RATES", rates):
            post_response = self.client.post(
                _invite_url(self.trip.id),
                {"invitee_ids": [str(self.friend1.id)]},
                format="json",
                **_auth(self.captain),
            )
            self.assertEqual(post_response.status_code, 201)

            get_response = self.client.get(_invite_url(self.trip.id), **_auth(self.captain))
            self.assertEqual(get_response.status_code, 200)


class InvitableFriendsTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("cap@example.com", "captain", "CAP001")
        self.friend1 = create_completed_user("f1@example.com", "friend1", "F1_001")
        self.friend2 = create_completed_user("f2@example.com", "friend2", "F2_001")
        self.trip = _make_trip(self.captain)
        _make_friendship(self.captain, self.friend1)
        _make_friendship(self.captain, self.friend2)

    def test_returns_eligible_friends(self):
        res = self.client.get(_invitable_url(self.trip.id), **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        ids = [u["id"] for u in res.data["users"]]
        self.assertIn(str(self.friend1.id), ids)
        self.assertIn(str(self.friend2.id), ids)

    def test_excludes_existing_members(self):
        TripMember.objects.create(trip=self.trip, user=self.friend1, role=TripRole.MEMBER, status=MemberStatus.ACTIVE)
        res = self.client.get(_invitable_url(self.trip.id), **_auth(self.captain))
        ids = [u["id"] for u in res.data["users"]]
        self.assertNotIn(str(self.friend1.id), ids)

    def test_excludes_pending_invitees(self):
        TripInvitation.objects.create(
            trip=self.trip,
            inviter=self.captain,
            invitee=self.friend2,
            status=InvitationStatus.PENDING,
        )
        res = self.client.get(_invitable_url(self.trip.id), **_auth(self.captain))
        ids = [u["id"] for u in res.data["users"]]
        self.assertNotIn(str(self.friend2.id), ids)
