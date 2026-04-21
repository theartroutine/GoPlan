from __future__ import annotations

import threading
import time
from unittest.mock import patch

from django.db import IntegrityError, close_old_connections, connections, transaction
from django.test import TransactionTestCase

from friends.models import Friendship
from test_helpers import create_completed_user
from trips.models import InvitationStatus, MemberStatus, Trip, TripInvitation, TripMember, TripRole, TripStatus
from trips.services import InviteError, InvitationError, accept_invitation, send_trip_invitations


def _make_friendship(user_a, user_b):
    low, high = (user_a, user_b) if str(user_a.pk) < str(user_b.pk) else (user_b, user_a)
    return Friendship.objects.create(user_low=low, user_high=high)


def _make_trip(captain, *, status=TripStatus.PLANNING):
    trip = Trip.objects.create(
        created_by=captain,
        name="T",
        destination="D",
        start_date="2026-06-01",
        end_date="2026-06-05",
        status=status,
    )
    TripMember.objects.create(
        trip=trip,
        user=captain,
        role=TripRole.CAPTAIN,
        status=MemberStatus.ACTIVE,
    )
    return trip


def _make_invitation(trip, captain, invitee):
    return TripInvitation.objects.create(
        trip=trip,
        inviter=captain,
        invitee=invitee,
        status=InvitationStatus.PENDING,
    )


class TripServiceConcurrencyTests(TransactionTestCase):

    def _run_in_thread(self, target):
        outcome = {}

        def runner():
            close_old_connections()
            try:
                outcome["value"] = target()
            except Exception as exc:  # pragma: no cover - asserted by caller
                outcome["error"] = exc
            finally:
                close_old_connections()
                connections.close_all()

        thread = threading.Thread(target=runner)
        thread.start()
        return thread, outcome

    def test_send_trip_invitations_waits_for_terminal_trip_transition(self):
        captain = create_completed_user("cap@example.com", "captain", "CAP001")
        invitee = create_completed_user("inv@example.com", "invitee", "INV001")
        trip = _make_trip(captain)
        _make_friendship(captain, invitee)

        transition_started = threading.Event()
        allow_commit = threading.Event()

        def close_trip_worker():
            with transaction.atomic():
                locked_trip = Trip.objects.select_for_update().get(pk=trip.pk)
                locked_trip.status = TripStatus.CANCELLED
                locked_trip.save(update_fields=["status"])
                transition_started.set()
                if not allow_commit.wait(timeout=5):
                    raise AssertionError("Timed out waiting to commit terminal trip transition.")

        close_thread, close_outcome = self._run_in_thread(close_trip_worker)
        self.assertTrue(transition_started.wait(timeout=5))

        with patch("trips.services.create_notification"):
            invite_thread, invite_outcome = self._run_in_thread(
                lambda: send_trip_invitations(trip=trip, captain=captain, invitee_ids=[invitee.pk])
            )

            time.sleep(0.2)
            self.assertTrue(invite_thread.is_alive())

            allow_commit.set()
            invite_thread.join(timeout=5)

        close_thread.join(timeout=5)

        self.assertFalse(close_thread.is_alive())
        self.assertIsNone(close_outcome.get("error"))
        self.assertFalse(invite_thread.is_alive())
        self.assertIsInstance(invite_outcome.get("error"), InviteError)
        self.assertIn("completed or cancelled", str(invite_outcome["error"]))
        self.assertFalse(TripInvitation.objects.filter(trip=trip).exists())

    def test_accept_invitation_waits_for_terminal_trip_transition(self):
        captain = create_completed_user("cap2@example.com", "captain2", "CAP002")
        invitee = create_completed_user("inv2@example.com", "invitee2", "INV002")
        trip = _make_trip(captain, status=TripStatus.ONGOING)
        invitation = _make_invitation(trip, captain, invitee)

        transition_started = threading.Event()
        allow_commit = threading.Event()

        def close_trip_worker():
            with transaction.atomic():
                locked_trip = Trip.objects.select_for_update().get(pk=trip.pk)
                locked_trip.status = TripStatus.COMPLETED
                locked_trip.save(update_fields=["status"])
                transition_started.set()
                if not allow_commit.wait(timeout=5):
                    raise AssertionError("Timed out waiting to commit terminal trip transition.")

        close_thread, close_outcome = self._run_in_thread(close_trip_worker)
        self.assertTrue(transition_started.wait(timeout=5))

        with patch("trips.services.create_notification"):
            accept_thread, accept_outcome = self._run_in_thread(
                lambda: accept_invitation(invitation_id=invitation.pk, actor=invitee)
            )

            time.sleep(0.2)
            self.assertTrue(accept_thread.is_alive())

            allow_commit.set()
            accept_thread.join(timeout=5)

        close_thread.join(timeout=5)

        self.assertFalse(close_thread.is_alive())
        self.assertIsNone(close_outcome.get("error"))
        self.assertFalse(accept_thread.is_alive())
        self.assertIsInstance(accept_outcome.get("error"), InvitationError)
        self.assertIn("no longer open to new members", str(accept_outcome["error"]))
        self.assertFalse(TripMember.objects.filter(trip=trip, user=invitee, status=MemberStatus.ACTIVE).exists())
        invitation.refresh_from_db()
        self.assertEqual(invitation.status, InvitationStatus.PENDING)

    def test_send_trip_invitations_converts_integrity_error_to_business_error(self):
        captain = create_completed_user("cap3@example.com", "captain3", "CAP003")
        invitee = create_completed_user("inv3@example.com", "invitee3", "INV003")
        trip = _make_trip(captain)
        _make_friendship(captain, invitee)

        with patch("trips.services.create_notification"), patch(
            "trips.services.TripInvitation.objects.create",
            side_effect=IntegrityError("duplicate key value violates unique constraint"),
        ):
            with self.assertRaises(InviteError) as exc_info:
                send_trip_invitations(trip=trip, captain=captain, invitee_ids=[invitee.pk])

        self.assertIn("already has a pending invitation", str(exc_info.exception))
