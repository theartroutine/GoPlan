from __future__ import annotations

import uuid
from decimal import Decimal

from django.test import TestCase

from expenses.models import (
    Expense,
    ExpenseLedgerEntry,
    ExpenseLedgerEventType,
    ExpenseParticipant,
)
from expenses.services import ExpenseServiceError, create_expense
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus
from trips.services import TripNotFoundError


def _make_trip(created_by, **kwargs):
    defaults = {
        "name": "Expense Trip",
        "destination": "Da Lat",
        "start_date": "2026-06-01",
        "end_date": "2026-06-05",
        "currency_code": "VND",
        "status": TripStatus.PLANNING,
    }
    defaults.update(kwargs)
    return Trip.objects.create(created_by=created_by, **defaults)


class ExpenseCreationServiceTests(TestCase):
    def setUp(self):
        self.captain = create_completed_user(
            "captain@example.com",
            "captain",
            "CAP001",
            display_name="Captain E",
        )
        self.member = create_completed_user(
            "member@example.com",
            "member",
            "MEM001",
            display_name="Member E",
        )
        self.trip = _make_trip(self.captain)
        TripMember.objects.create(
            trip=self.trip,
            user=self.captain,
            role=TripRole.CAPTAIN,
            status=MemberStatus.ACTIVE,
        )
        TripMember.objects.create(
            trip=self.trip,
            user=self.member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )

    def test_create_expense_snapshots_active_members_and_even_shares(self):
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Dinner",
            total_amount=Decimal("600000"),
        )

        self.assertEqual(Expense.objects.count(), 1)
        self.assertEqual(expense.collector, self.captain)

        participants = list(ExpenseParticipant.objects.order_by("created_at"))
        self.assertEqual(len(participants), 2)
        self.assertEqual(
            [participant.share_amount for participant in participants],
            [Decimal("300000"), Decimal("300000")],
        )
        self.assertEqual(participants[0].display_name_snapshot, "Captain E")

    def test_rejects_vnd_fractional_minor_unit_without_creating_expense(self):
        with self.assertRaises(ExpenseServiceError):
            create_expense(
                trip_id=self.trip.id,
                actor=self.captain,
                title="Fractional Dinner",
                total_amount=Decimal("100.50"),
            )

        self.assertEqual(Expense.objects.count(), 0)
        self.assertEqual(ExpenseParticipant.objects.count(), 0)

    def test_vnd_remainder_split_is_deterministic(self):
        third_member = create_completed_user(
            "third@example.com",
            "third",
            "THD001",
            display_name="Third E",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=third_member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )

        create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Shared Booking",
            total_amount=Decimal("1000000"),
        )

        participants = list(ExpenseParticipant.objects.order_by("created_at"))
        self.assertEqual(
            [participant.share_amount for participant in participants],
            [Decimal("333334"), Decimal("333333"), Decimal("333333")],
        )
        self.assertEqual(
            sum(participant.share_amount for participant in participants),
            Decimal("1000000"),
        )

    def test_departed_member_is_not_included_in_new_expense_snapshot(self):
        departed = create_completed_user(
            "departed@example.com",
            "departed",
            "DEP001",
            display_name="Departed E",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=departed,
            role=TripRole.MEMBER,
            status=MemberStatus.LEFT,
        )

        create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Active Members Only",
            total_amount=Decimal("600000"),
        )

        self.assertEqual(ExpenseParticipant.objects.count(), 2)
        self.assertFalse(ExpenseParticipant.objects.filter(user=departed).exists())

    def test_rejects_invalid_collector(self):
        outsider = create_completed_user(
            "outsider@example.com",
            "outsider",
            "OUT001",
            display_name="Outsider E",
        )

        with self.assertRaises(ExpenseServiceError):
            create_expense(
                trip_id=self.trip.id,
                actor=self.captain,
                title="Outsider Collector",
                total_amount=Decimal("600000"),
                collector=outsider,
            )

        self.assertEqual(Expense.objects.count(), 0)

    def test_rejects_departed_collector(self):
        departed = create_completed_user(
            "departed@example.com",
            "departed",
            "DEP001",
            display_name="Departed E",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=departed,
            role=TripRole.MEMBER,
            status=MemberStatus.LEFT,
        )

        with self.assertRaises(ExpenseServiceError):
            create_expense(
                trip_id=self.trip.id,
                actor=self.captain,
                title="Departed Collector",
                total_amount=Decimal("600000"),
                collector=departed,
            )

        self.assertEqual(Expense.objects.count(), 0)

    def test_creates_ledger_entry_for_expense_created(self):
        expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Dinner",
            total_amount=Decimal("600000"),
        )

        ledger_entry = ExpenseLedgerEntry.objects.get()
        self.assertEqual(ledger_entry.trip, self.trip)
        self.assertEqual(ledger_entry.expense, expense)
        self.assertEqual(ledger_entry.actor, self.captain)
        self.assertEqual(ledger_entry.event_type, ExpenseLedgerEventType.EXPENSE_CREATED)

    def test_create_expense_with_explicit_active_member_collector(self):
        captain = create_completed_user(
            "second-captain@example.com",
            "secondcaptain",
            "SCAP01",
        )
        member = create_completed_user(
            "second-member@example.com",
            "secondmember",
            "SMEM01",
        )
        trip = _make_trip(captain, name="Second Expense Trip")
        TripMember.objects.create(
            trip=trip,
            user=captain,
            role=TripRole.CAPTAIN,
            status=MemberStatus.ACTIVE,
        )
        TripMember.objects.create(
            trip=trip,
            user=member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )

        expense = create_expense(
            trip_id=trip.id,
            actor=captain,
            title="Dinner",
            total_amount=Decimal("600000"),
            collector=member,
        )

        self.assertEqual(expense.collector, member)

    def test_create_expense_for_missing_trip_raises_trip_not_found(self):
        with self.assertRaises(TripNotFoundError):
            create_expense(
                trip_id=uuid.uuid4(),
                actor=self.captain,
                title="Missing Trip",
                total_amount=Decimal("600000"),
            )

        self.assertEqual(Expense.objects.count(), 0)
