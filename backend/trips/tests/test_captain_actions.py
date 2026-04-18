from django.utils import timezone
from rest_framework.test import APITestCase
from accounts.tokens import AccessToken
from test_helpers import create_completed_user
from trips.models import (
    InvitationStatus, MemberStatus, Trip, TripInvitation, TripMember,
    TripRole, TripStatus,
)


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _make_trip(captain, status=TripStatus.PLANNING):
    trip = Trip.objects.create(
        created_by=captain, name="T", destination="D",
        start_date="2026-06-01", end_date="2026-06-05", status=status,
    )
    TripMember.objects.create(trip=trip, user=captain, role=TripRole.CAPTAIN, status=MemberStatus.ACTIVE)
    return trip


def _add_member(trip, user):
    return TripMember.objects.create(trip=trip, user=user, role=TripRole.MEMBER, status=MemberStatus.ACTIVE)


def _make_invitation(trip, captain, invitee):
    return TripInvitation.objects.create(
        trip=trip, inviter=captain, invitee=invitee, status=InvitationStatus.PENDING
    )


class StartTripTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("cap@example.com", "captain", "CAP001")
        self.member = create_completed_user("mem@example.com", "member", "MEM001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)

    def test_start_200(self):
        res = self.client.post(f"/api/trips/{self.trip.id}/start", **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.status, TripStatus.ONGOING)

    def test_only_captain_403(self):
        res = self.client.post(f"/api/trips/{self.trip.id}/start", **_auth(self.member))
        self.assertEqual(res.status_code, 403)

    def test_start_ongoing_trip_409(self):
        self.trip.status = TripStatus.ONGOING
        self.trip.save()
        res = self.client.post(f"/api/trips/{self.trip.id}/start", **_auth(self.captain))
        self.assertEqual(res.status_code, 409)
        self.assertIn("error_code", res.data)
        self.assertEqual(res.data["error_code"], "INVALID_STATUS_TRANSITION")

    def test_start_completed_trip_409(self):
        self.trip.status = TripStatus.COMPLETED
        self.trip.save()
        res = self.client.post(f"/api/trips/{self.trip.id}/start", **_auth(self.captain))
        self.assertEqual(res.status_code, 409)


class CompleteTripTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("cap@example.com", "captain", "CAP001")
        self.trip = _make_trip(self.captain, status=TripStatus.ONGOING)

    def test_complete_200(self):
        res = self.client.post(f"/api/trips/{self.trip.id}/complete", **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        self.trip.refresh_from_db()
        self.assertEqual(self.trip.status, TripStatus.COMPLETED)

    def test_complete_planning_trip_409(self):
        self.trip.status = TripStatus.PLANNING
        self.trip.save()
        res = self.client.post(f"/api/trips/{self.trip.id}/complete", **_auth(self.captain))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "INVALID_STATUS_TRANSITION")

    def test_only_captain_403(self):
        other = create_completed_user("other@example.com", "other", "OTH001")
        _add_member(self.trip, other)
        res = self.client.post(f"/api/trips/{self.trip.id}/complete", **_auth(other))
        self.assertEqual(res.status_code, 403)

    def test_complete_cancels_pending_invitations(self):
        # Regression: completing a trip must close out stale PENDING invitations
        # so they cannot be accepted into a terminal trip.
        invitee = create_completed_user("inv@example.com", "invitee", "INV001")
        inv = _make_invitation(self.trip, self.captain, invitee)
        res = self.client.post(f"/api/trips/{self.trip.id}/complete", **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        inv.refresh_from_db()
        self.assertEqual(inv.status, InvitationStatus.CANCELLED)


class CancelTripTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("cap@example.com", "captain", "CAP001")
        self.invitee = create_completed_user("inv@example.com", "invitee", "INV001")

    def test_cancel_from_planning_200(self):
        trip = _make_trip(self.captain, status=TripStatus.PLANNING)
        res = self.client.post(f"/api/trips/{trip.id}/cancel", **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        trip.refresh_from_db()
        self.assertEqual(trip.status, TripStatus.CANCELLED)
        self.assertIsNotNone(trip.cancelled_at)

    def test_cancel_from_ongoing_200(self):
        trip = _make_trip(self.captain, status=TripStatus.ONGOING)
        res = self.client.post(f"/api/trips/{trip.id}/cancel", **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        trip.refresh_from_db()
        self.assertEqual(trip.status, TripStatus.CANCELLED)

    def test_cancel_completed_trip_409(self):
        trip = _make_trip(self.captain, status=TripStatus.COMPLETED)
        res = self.client.post(f"/api/trips/{trip.id}/cancel", **_auth(self.captain))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "TRIP_TERMINAL")

    def test_cancel_cancels_pending_invitations(self):
        trip = _make_trip(self.captain)
        inv = _make_invitation(trip, self.captain, self.invitee)
        self.client.post(f"/api/trips/{trip.id}/cancel", **_auth(self.captain))
        inv.refresh_from_db()
        self.assertEqual(inv.status, InvitationStatus.CANCELLED)

    def test_only_captain_403(self):
        trip = _make_trip(self.captain)
        other = create_completed_user("other@example.com", "other", "OTH001")
        _add_member(trip, other)
        res = self.client.post(f"/api/trips/{trip.id}/cancel", **_auth(other))
        self.assertEqual(res.status_code, 403)


class RemoveMemberTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("cap@example.com", "captain", "CAP001")
        self.member = create_completed_user("mem@example.com", "member", "MEM001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)

    def _url(self, user_id=None):
        uid = user_id or self.member.id
        return f"/api/trips/{self.trip.id}/members/{uid}"

    def test_remove_200(self):
        res = self.client.delete(self._url(), **_auth(self.captain))
        self.assertEqual(res.status_code, 200)
        membership = TripMember.objects.get(trip=self.trip, user=self.member)
        self.assertEqual(membership.status, MemberStatus.REMOVED)
        self.assertIsNotNone(membership.left_at)

    def test_only_captain_403(self):
        other = create_completed_user("other@example.com", "other", "OTH001")
        _add_member(self.trip, other)
        res = self.client.delete(self._url(self.member.id), **_auth(other))
        self.assertEqual(res.status_code, 403)

    def test_cannot_remove_self_400(self):
        res = self.client.delete(self._url(self.captain.id), **_auth(self.captain))
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error_code"], "CANNOT_REMOVE_SELF")

    def test_remove_non_member_404(self):
        stranger = create_completed_user("stranger@example.com", "stranger", "STR001")
        res = self.client.delete(self._url(stranger.id), **_auth(self.captain))
        self.assertEqual(res.status_code, 404)

    def test_remove_in_terminal_trip_409(self):
        self.trip.status = TripStatus.CANCELLED
        self.trip.save()
        res = self.client.delete(self._url(), **_auth(self.captain))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["error_code"], "TRIP_TERMINAL")
