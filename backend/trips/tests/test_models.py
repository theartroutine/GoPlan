from __future__ import annotations

from django.db import IntegrityError, transaction
from django.test import TestCase

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


def _make_trip(created_by, **kwargs):
    defaults = {
        "name": "Test Trip",
        "destination": "Đà Lạt",
        "start_date": "2026-06-01",
        "end_date": "2026-06-05",
        "currency_code": "VND",
        "status": TripStatus.PLANNING,
    }
    defaults.update(kwargs)
    return Trip.objects.create(created_by=created_by, **defaults)


class TripModelTests(TestCase):

    def setUp(self):
        self.user = create_completed_user("captain@example.com", "captain", "CAP001")

    def test_creates_with_valid_dates(self):
        trip = _make_trip(self.user)
        self.assertEqual(trip.status, TripStatus.PLANNING)
        self.assertIsNone(trip.cancelled_at)
        self.assertIsNone(trip.budget_estimate)

    def test_end_date_before_start_date_raises(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                _make_trip(self.user, start_date="2026-06-05", end_date="2026-06-01")

    def test_same_start_and_end_date_allowed(self):
        trip = _make_trip(self.user, start_date="2026-06-01", end_date="2026-06-01")
        self.assertIsNotNone(trip.pk)

    def test_past_start_date_allowed(self):
        trip = _make_trip(self.user, start_date="2020-01-01", end_date="2020-01-05")
        self.assertIsNotNone(trip.pk)


class TripMemberModelTests(TestCase):

    def setUp(self):
        self.captain = create_completed_user("captain@example.com", "captain", "CAP001")
        self.member = create_completed_user("member@example.com", "member", "MEM001")
        self.trip = _make_trip(self.captain)

    def test_two_active_memberships_same_user_same_trip_raises(self):
        TripMember.objects.create(trip=self.trip, user=self.captain, role=TripRole.CAPTAIN, status=MemberStatus.ACTIVE)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TripMember.objects.create(trip=self.trip, user=self.captain, role=TripRole.MEMBER, status=MemberStatus.ACTIVE)

    def test_left_then_active_allowed(self):
        TripMember.objects.create(trip=self.trip, user=self.member, role=TripRole.MEMBER, status=MemberStatus.LEFT)
        # Re-invite: a new ACTIVE row should be allowed
        m2 = TripMember.objects.create(trip=self.trip, user=self.member, role=TripRole.MEMBER, status=MemberStatus.ACTIVE)
        self.assertEqual(m2.status, MemberStatus.ACTIVE)

    def test_two_left_rows_same_user_allowed(self):
        TripMember.objects.create(trip=self.trip, user=self.member, role=TripRole.MEMBER, status=MemberStatus.LEFT)
        m2 = TripMember.objects.create(trip=self.trip, user=self.member, role=TripRole.MEMBER, status=MemberStatus.LEFT)
        self.assertIsNotNone(m2.pk)


class TripInvitationModelTests(TestCase):

    def setUp(self):
        self.captain = create_completed_user("captain@example.com", "captain", "CAP001")
        self.invitee = create_completed_user("invitee@example.com", "invitee", "INV001")
        self.trip = _make_trip(self.captain)

    def test_two_pending_invitations_same_invitee_same_trip_raises(self):
        TripInvitation.objects.create(trip=self.trip, inviter=self.captain, invitee=self.invitee, status=InvitationStatus.PENDING)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TripInvitation.objects.create(trip=self.trip, inviter=self.captain, invitee=self.invitee, status=InvitationStatus.PENDING)

    def test_declined_then_new_pending_allowed(self):
        TripInvitation.objects.create(trip=self.trip, inviter=self.captain, invitee=self.invitee, status=InvitationStatus.DECLINED)
        inv2 = TripInvitation.objects.create(trip=self.trip, inviter=self.captain, invitee=self.invitee, status=InvitationStatus.PENDING)
        self.assertEqual(inv2.status, InvitationStatus.PENDING)
