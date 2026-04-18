from __future__ import annotations

from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from test_helpers import create_completed_user
from trips.models import (
    InvitationStatus,
    MemberStatus,
    Trip,
    TripInvitation,
    TripMember,
    TripRole,
    TripStatus,
)


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


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


def _make_invitation(trip, captain, invitee):
    return TripInvitation.objects.create(
        trip=trip, inviter=captain, invitee=invitee, status=InvitationStatus.PENDING
    )


def _accept_url(inv_id):
    return f"/api/invitations/{inv_id}/accept"


def _decline_url(inv_id):
    return f"/api/invitations/{inv_id}/decline"


class AcceptInvitationTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("cap@example.com", "captain", "CAP001")
        self.invitee = create_completed_user("inv@example.com", "invitee", "INV001")
        self.trip = _make_trip(self.captain)
        self.invitation = _make_invitation(self.trip, self.captain, self.invitee)

    def test_accept_200(self):
        res = self.client.post(_accept_url(self.invitation.id), **_auth(self.invitee))
        self.assertEqual(res.status_code, 200)
        self.invitation.refresh_from_db()
        self.assertEqual(self.invitation.status, InvitationStatus.ACCEPTED)
        self.assertTrue(
            TripMember.objects.filter(
                trip=self.trip, user=self.invitee, role=TripRole.MEMBER, status=MemberStatus.ACTIVE
            ).exists()
        )

    def test_only_invitee_can_accept_403(self):
        other = create_completed_user("other@example.com", "other", "OTH001")
        res = self.client.post(_accept_url(self.invitation.id), **_auth(other))
        self.assertEqual(res.status_code, 403)

    def test_cannot_accept_non_pending_409(self):
        self.invitation.status = InvitationStatus.DECLINED
        self.invitation.save()
        res = self.client.post(_accept_url(self.invitation.id), **_auth(self.invitee))
        self.assertEqual(res.status_code, 409)

    def test_cannot_accept_into_completed_trip_409(self):
        # Regression: a PENDING invitation must not grant membership to a terminal trip.
        self.trip.status = TripStatus.COMPLETED
        self.trip.save()
        res = self.client.post(_accept_url(self.invitation.id), **_auth(self.invitee))
        self.assertEqual(res.status_code, 409)
        self.assertFalse(
            TripMember.objects.filter(trip=self.trip, user=self.invitee).exists()
        )

    def test_cannot_accept_into_cancelled_trip_409(self):
        self.trip.status = TripStatus.CANCELLED
        self.trip.save()
        res = self.client.post(_accept_url(self.invitation.id), **_auth(self.invitee))
        self.assertEqual(res.status_code, 409)
        self.assertFalse(
            TripMember.objects.filter(trip=self.trip, user=self.invitee).exists()
        )

    def test_trip_appears_in_invitee_list_after_accept(self):
        self.client.post(_accept_url(self.invitation.id), **_auth(self.invitee))
        list_res = self.client.get("/api/trips/", **_auth(self.invitee))
        ids = [t["id"] for t in list_res.data["results"]]
        self.assertIn(str(self.trip.id), ids)


class DeclineInvitationTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("cap@example.com", "captain", "CAP001")
        self.invitee = create_completed_user("inv@example.com", "invitee", "INV001")
        self.trip = _make_trip(self.captain)
        self.invitation = _make_invitation(self.trip, self.captain, self.invitee)

    def test_decline_200(self):
        res = self.client.post(_decline_url(self.invitation.id), **_auth(self.invitee))
        self.assertEqual(res.status_code, 200)
        self.invitation.refresh_from_db()
        self.assertEqual(self.invitation.status, InvitationStatus.DECLINED)
        self.assertFalse(
            TripMember.objects.filter(trip=self.trip, user=self.invitee).exists()
        )

    def test_only_invitee_can_decline_403(self):
        other = create_completed_user("other@example.com", "other", "OTH001")
        res = self.client.post(_decline_url(self.invitation.id), **_auth(other))
        self.assertEqual(res.status_code, 403)

    def test_cannot_decline_non_pending_409(self):
        self.invitation.status = InvitationStatus.ACCEPTED
        self.invitation.save()
        res = self.client.post(_decline_url(self.invitation.id), **_auth(self.invitee))
        self.assertEqual(res.status_code, 409)
