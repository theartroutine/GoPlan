from __future__ import annotations

from decimal import Decimal

from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from expenses.models import Expense, ExpenseLedgerEntry, ExpenseLedgerEventType, SettlementTransfer
from expenses.services import create_expense, set_contribution
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _make_trip(created_by, **kwargs):
    defaults = {
        "name": "Settlement API Trip",
        "destination": "Da Lat",
        "start_date": "2026-06-01",
        "end_date": "2026-06-05",
        "currency_code": "VND",
        "status": TripStatus.PLANNING,
    }
    defaults.update(kwargs)
    return Trip.objects.create(created_by=created_by, **defaults)


class SettlementAPITests(APITestCase):
    def setUp(self):
        self.captain = create_completed_user(
            "settlement-captain@example.com",
            "settlementcaptain",
            "SCA001",
            display_name="Captain E",
        )
        self.member_a = create_completed_user(
            "settlement-member-a@example.com",
            "settlementmembera",
            "SMA001",
            display_name="Member A",
        )
        self.member_c = create_completed_user(
            "settlement-member-c@example.com",
            "settlementmemberc",
            "SMC001",
            display_name="Member C",
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
            user=self.member_a,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        TripMember.objects.create(
            trip=self.trip,
            user=self.member_c,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        self.expense = create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Shared Booking",
            total_amount=Decimal("900000"),
        )
        set_contribution(
            trip_id=self.trip.id,
            expense_id=self.expense.id,
            target_user_id=self.member_c.id,
            actor=self.captain,
            amount=Decimal("900000"),
        )
        ExpenseLedgerEntry.objects.all().delete()

    def _finalize_url(self):
        return f"/api/trips/{self.trip.id}/settlement/finalize"

    def _reopen_url(self):
        return f"/api/trips/{self.trip.id}/settlement/reopen"

    def _sent_url(self, transfer):
        return f"/api/trips/{self.trip.id}/settlement/transfers/{transfer.id}/sent"

    def _received_url(self, transfer):
        return f"/api/trips/{self.trip.id}/settlement/transfers/{transfer.id}/received"

    def _finalize(self):
        return self.client.post(self._finalize_url(), {}, format="json", **_auth(self.captain))

    def test_finalize_creates_transfer_and_locks_expense(self):
        response = self._finalize()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "FINALIZED")
        self.assertEqual(len(response.data["transfers"]), 2)
        self.expense.refresh_from_db()
        self.assertIsNotNone(self.expense.locked_at)

        transfers = {
            (str(transfer.payer_id), str(transfer.recipient_id), transfer.amount)
            for transfer in SettlementTransfer.objects.all()
        }
        self.assertEqual(
            transfers,
            {
                (str(self.member_a.id), str(self.member_c.id), Decimal("300000")),
                (str(self.captain.id), str(self.member_c.id), Decimal("300000")),
            },
        )
        self.assertTrue(
            ExpenseLedgerEntry.objects.filter(
                event_type=ExpenseLedgerEventType.SETTLEMENT_FINALIZED,
                actor=self.captain,
            ).exists()
        )

    def test_payer_marks_sent_and_recipient_confirms_received(self):
        self._finalize()
        transfer = SettlementTransfer.objects.get(payer=self.member_a)

        sent_response = self.client.post(
            self._sent_url(transfer),
            {},
            format="json",
            **_auth(self.member_a),
        )
        received_response = self.client.post(
            self._received_url(transfer),
            {},
            format="json",
            **_auth(self.member_c),
        )

        self.assertEqual(sent_response.status_code, 200)
        self.assertEqual(received_response.status_code, 200)
        transfer.refresh_from_db()
        self.assertIsNotNone(transfer.payer_marked_sent_at)
        self.assertIsNotNone(transfer.recipient_confirmed_at)
        self.assertTrue(
            ExpenseLedgerEntry.objects.filter(
                event_type=ExpenseLedgerEventType.TRANSFER_MARKED_SENT,
                actor=self.member_a,
            ).exists()
        )
        self.assertTrue(
            ExpenseLedgerEntry.objects.filter(
                event_type=ExpenseLedgerEventType.TRANSFER_CONFIRMED_RECEIVED,
                actor=self.member_c,
            ).exists()
        )

    def test_non_recipient_cannot_confirm_received(self):
        self._finalize()
        transfer = SettlementTransfer.objects.get(payer=self.member_a)

        response = self.client.post(
            self._received_url(transfer),
            {},
            format="json",
            **_auth(self.member_a),
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error_code"], "NOT_TRANSFER_RECIPIENT")

    def test_non_payer_cannot_mark_sent(self):
        self._finalize()
        transfer = SettlementTransfer.objects.get(payer=self.member_a)

        response = self.client.post(
            self._sent_url(transfer),
            {},
            format="json",
            **_auth(self.member_c),
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error_code"], "NOT_TRANSFER_PAYER")

    def test_captain_cannot_confirm_someone_elses_receipt(self):
        self._finalize()
        transfer = SettlementTransfer.objects.get(payer=self.member_a)

        response = self.client.post(
            self._received_url(transfer),
            {},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error_code"], "NOT_TRANSFER_RECIPIENT")

    def test_finalize_twice_returns_conflict(self):
        first_response = self._finalize()
        second_response = self._finalize()

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 409)
        self.assertEqual(second_response.data["error_code"], "SETTLEMENT_ALREADY_FINALIZED")

    def test_create_expense_after_finalize_returns_conflict_without_creating_expense(self):
        self._finalize()

        response = self.client.post(
            f"/api/trips/{self.trip.id}/expenses",
            {"title": "Late Booking", "total_amount": "300000"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "SETTLEMENT_ALREADY_FINALIZED")
        self.assertEqual(Expense.objects.count(), 1)

    def test_contribution_cannot_be_changed_after_finalize(self):
        self._finalize()
        contribution_url = (
            f"/api/trips/{self.trip.id}/expenses/{self.expense.id}/contributions/"
            f"{self.member_a.id}"
        )

        response = self.client.patch(
            contribution_url,
            {"amount": "300000"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "EXPENSE_LOCKED")

    def test_reopen_unlocks_expenses_and_old_transfer_actions_return_not_found(self):
        self._finalize()
        transfer = SettlementTransfer.objects.get(payer=self.member_a)

        reopen_response = self.client.post(
            self._reopen_url(),
            {},
            format="json",
            **_auth(self.captain),
        )
        sent_response = self.client.post(
            self._sent_url(transfer),
            {},
            format="json",
            **_auth(self.member_a),
        )

        self.assertEqual(reopen_response.status_code, 200)
        self.assertEqual(reopen_response.data["status"], "REOPENED")
        self.expense.refresh_from_db()
        self.assertIsNone(self.expense.locked_at)
        self.assertEqual(sent_response.status_code, 404)
        self.assertEqual(sent_response.data["error_code"], "TRANSFER_NOT_FOUND")
        self.assertTrue(
            ExpenseLedgerEntry.objects.filter(
                event_type=ExpenseLedgerEventType.SETTLEMENT_REOPENED,
                actor=self.captain,
            ).exists()
        )

    def test_captain_can_refinalize_after_reopen(self):
        first_response = self._finalize()
        self.client.post(
            self._reopen_url(),
            {},
            format="json",
            **_auth(self.captain),
        )

        second_response = self._finalize()

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(second_response.data["status"], "FINALIZED")
        self.assertEqual(
            ExpenseLedgerEntry.objects.filter(
                event_type=ExpenseLedgerEventType.SETTLEMENT_FINALIZED,
                actor=self.captain,
            ).count(),
            2,
        )

    def test_finalize_underfunded_trip_returns_specific_conflict(self):
        Expense.objects.all().delete()
        create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Unpaid booking",
            total_amount=Decimal("900000"),
        )

        response = self.client.post(
            self._finalize_url(),
            {},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "SETTLEMENT_UNDERFUNDED")
        self.assertIn("900000", response.data["detail"])

    def test_departed_payer_can_mark_finalized_transfer_sent(self):
        self._finalize()
        transfer = SettlementTransfer.objects.get(payer=self.member_a)
        TripMember.objects.filter(trip=self.trip, user=self.member_a).update(
            status=MemberStatus.LEFT,
        )

        response = self.client.post(
            self._sent_url(transfer),
            {},
            format="json",
            **_auth(self.member_a),
        )

        self.assertEqual(response.status_code, 200)
        transfer.refresh_from_db()
        self.assertIsNotNone(transfer.payer_marked_sent_at)

    def test_departed_recipient_can_confirm_finalized_transfer_received(self):
        self._finalize()
        transfer = SettlementTransfer.objects.get(payer=self.member_a)
        TripMember.objects.filter(trip=self.trip, user=self.member_c).update(
            status=MemberStatus.LEFT,
        )

        response = self.client.post(
            self._received_url(transfer),
            {},
            format="json",
            **_auth(self.member_c),
        )

        self.assertEqual(response.status_code, 200)
        transfer.refresh_from_db()
        self.assertIsNotNone(transfer.recipient_confirmed_at)

    def test_non_captain_cannot_finalize_or_reopen(self):
        finalize_response = self.client.post(
            self._finalize_url(),
            {},
            format="json",
            **_auth(self.member_a),
        )
        self._finalize()
        reopen_response = self.client.post(
            self._reopen_url(),
            {},
            format="json",
            **_auth(self.member_a),
        )

        self.assertEqual(finalize_response.status_code, 403)
        self.assertEqual(finalize_response.data["error_code"], "NOT_CAPTAIN")
        self.assertEqual(reopen_response.status_code, 403)
        self.assertEqual(reopen_response.data["error_code"], "NOT_CAPTAIN")

    def test_reopen_without_finalized_settlement_returns_conflict(self):
        response = self.client.post(
            self._reopen_url(),
            {},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "SETTLEMENT_NOT_FINALIZED")

    def test_finalize_single_member_funded_trip_creates_empty_settlement(self):
        solo_captain = create_completed_user(
            "settlement-solo-captain@example.com",
            "settlementsolo",
            "SSO001",
            display_name="Solo Captain",
        )
        solo_trip = _make_trip(solo_captain, name="Solo Settlement Trip")
        TripMember.objects.create(
            trip=solo_trip,
            user=solo_captain,
            role=TripRole.CAPTAIN,
            status=MemberStatus.ACTIVE,
        )
        solo_expense = create_expense(
            trip_id=solo_trip.id,
            actor=solo_captain,
            title="Solo booking",
            total_amount=Decimal("300000"),
        )
        set_contribution(
            trip_id=solo_trip.id,
            expense_id=solo_expense.id,
            target_user_id=solo_captain.id,
            actor=solo_captain,
            amount=Decimal("300000"),
        )

        response = self.client.post(
            f"/api/trips/{solo_trip.id}/settlement/finalize",
            {},
            format="json",
            **_auth(solo_captain),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["transfers"], [])

    def test_mark_transfer_sent_is_idempotent(self):
        self._finalize()
        transfer = SettlementTransfer.objects.get(payer=self.member_a)

        first_response = self.client.post(
            self._sent_url(transfer),
            {},
            format="json",
            **_auth(self.member_a),
        )
        transfer.refresh_from_db()
        first_marked_at = transfer.payer_marked_sent_at

        second_response = self.client.post(
            self._sent_url(transfer),
            {},
            format="json",
            **_auth(self.member_a),
        )
        transfer.refresh_from_db()

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(transfer.payer_marked_sent_at, first_marked_at)
        self.assertEqual(
            ExpenseLedgerEntry.objects.filter(
                event_type=ExpenseLedgerEventType.TRANSFER_MARKED_SENT,
            ).count(),
            1,
        )

    def test_confirm_transfer_received_is_idempotent(self):
        self._finalize()
        transfer = SettlementTransfer.objects.get(payer=self.member_a)

        first_response = self.client.post(
            self._received_url(transfer),
            {},
            format="json",
            **_auth(self.member_c),
        )
        transfer.refresh_from_db()
        first_confirmed_at = transfer.recipient_confirmed_at

        second_response = self.client.post(
            self._received_url(transfer),
            {},
            format="json",
            **_auth(self.member_c),
        )
        transfer.refresh_from_db()

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(transfer.recipient_confirmed_at, first_confirmed_at)
        self.assertEqual(
            ExpenseLedgerEntry.objects.filter(
                event_type=ExpenseLedgerEventType.TRANSFER_CONFIRMED_RECEIVED,
            ).count(),
            1,
        )

    def test_finalize_over_optimal_cap_uses_greedy_fallback(self):
        for index in range(17):
            member = create_completed_user(
                f"settlement-extra-{index}@example.com",
                f"settlementextra{index}",
                f"SX{index:04d}",
                display_name=f"Extra {index}",
            )
            TripMember.objects.create(
                trip=self.trip,
                user=member,
                role=TripRole.MEMBER,
                status=MemberStatus.ACTIVE,
            )
        Expense.objects.all().delete()
        create_expense(
            trip_id=self.trip.id,
            actor=self.captain,
            title="Large Shared Booking",
            total_amount=Decimal("1800000"),
        )
        expense = Expense.objects.get()
        for participant in expense.participants.all():
            set_contribution(
                trip_id=self.trip.id,
                expense_id=expense.id,
                target_user_id=participant.user_id,
                actor=self.captain,
                amount=participant.share_amount,
            )

        response = self.client.post(
            self._finalize_url(),
            {},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "FINALIZED")
