from __future__ import annotations

from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from expenses.models import Expense, ExpenseContribution, ExpenseLedgerEntry, ExpenseLedgerEventType
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _make_trip(created_by, **kwargs):
    defaults = {
        "name": "Expense API Trip",
        "destination": "Da Lat",
        "start_date": "2026-06-01",
        "end_date": "2026-06-05",
        "currency_code": "VND",
        "status": TripStatus.PLANNING,
    }
    defaults.update(kwargs)
    return Trip.objects.create(created_by=created_by, **defaults)


class ExpenseAPITests(APITestCase):
    def setUp(self):
        self.captain = create_completed_user(
            "expense-captain@example.com",
            "expensecaptain",
            "EXC001",
            display_name="Expense Captain",
        )
        self.member = create_completed_user(
            "expense-member@example.com",
            "expensemember",
            "EXM001",
            display_name="Expense Member",
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
        self.expenses_url = f"/api/trips/{self.trip.id}/expenses"

    def test_captain_creates_expense_and_dashboard_lists_it(self):
        create_response = self.client.post(
            self.expenses_url,
            {
                "title": "Dinner",
                "description": "Shared dinner",
                "total_amount": "600000",
            },
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(create_response.data["title"], "Dinner")
        self.assertEqual(create_response.data["total_amount"], "600000")

        dashboard_response = self.client.get(self.expenses_url, **_auth(self.captain))

        self.assertEqual(dashboard_response.status_code, 200)
        self.assertEqual(dashboard_response.data["summary"]["total_amount"], "600000")
        self.assertEqual(len(dashboard_response.data["expenses"]), 1)
        self.assertEqual(dashboard_response.data["expenses"][0]["title"], "Dinner")

    def test_active_member_cannot_create_expense(self):
        response = self.client.post(
            self.expenses_url,
            {"title": "Hotel", "total_amount": "600000"},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error_code"], "NOT_CAPTAIN")

    def test_captain_sets_contribution(self):
        expense_response = self.client.post(
            self.expenses_url,
            {"title": "Dinner", "total_amount": "600000"},
            format="json",
            **_auth(self.captain),
        )
        expense_id = expense_response.data["id"]

        response = self.client.patch(
            f"{self.expenses_url}/{expense_id}/contributions/{self.member.id}",
            {"amount": "300000"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["amount"], "300000")
        self.assertEqual(ExpenseContribution.objects.count(), 1)
        contribution = ExpenseContribution.objects.get()
        self.assertEqual(contribution.amount, Decimal("300000"))
        self.assertEqual(contribution.user, self.member)

    def test_expense_detail_returns_participant_snapshot_for_departed_member(self):
        expense_response = self.client.post(
            self.expenses_url,
            {"title": "Dinner", "description": "Shared seafood", "total_amount": "600000"},
            format="json",
            **_auth(self.captain),
        )
        expense_id = expense_response.data["id"]
        self.client.patch(
            f"{self.expenses_url}/{expense_id}/contributions/{self.member.id}",
            {"amount": "300000"},
            format="json",
            **_auth(self.captain),
        )
        TripMember.objects.filter(trip=self.trip, user=self.member).update(
            status=MemberStatus.LEFT,
            left_at=timezone.now(),
        )

        response = self.client.get(
            f"{self.expenses_url}/{expense_id}",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], expense_id)
        self.assertEqual(response.data["title"], "Dinner")
        self.assertEqual(response.data["description"], "Shared seafood")
        self.assertEqual(response.data["total_amount"], "600000")
        self.assertEqual(response.data["paid_amount"], "300000")
        self.assertEqual(response.data["missing_amount"], "300000")
        self.assertEqual(response.data["surplus_amount"], "0")
        self.assertEqual(response.data["currency_code"], "VND")
        self.assertEqual(response.data["status"], "UNDERFUNDED")
        self.assertFalse(response.data["locked"])
        self.assertEqual(len(response.data["participants"]), 2)

        participant_by_user_id = {
            participant["user_id"]: participant
            for participant in response.data["participants"]
        }
        departed_participant = participant_by_user_id[str(self.member.id)]
        self.assertEqual(departed_participant["display_name"], "Expense Member")
        self.assertEqual(departed_participant["identify_tag"], self.member.identify_tag)
        self.assertEqual(departed_participant["share_amount"], "300000")
        self.assertEqual(departed_participant["contributed_amount"], "300000")
        self.assertEqual(departed_participant["balance"], "0")

    def test_unauthenticated_dashboard_request_is_rejected(self):
        response = self.client.get(self.expenses_url)

        self.assertIn(response.status_code, {401, 403})

    def test_active_member_can_view_dashboard_without_manage_permission(self):
        self.client.post(
            self.expenses_url,
            {"title": "Dinner", "total_amount": "600000"},
            format="json",
            **_auth(self.captain),
        )

        response = self.client.get(self.expenses_url, **_auth(self.member))

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["permissions"]["can_manage_expenses"])
        self.assertEqual(len(response.data["expenses"]), 1)

    def test_empty_dashboard_returns_trip_currency_code(self):
        usd_trip = _make_trip(self.captain, name="Empty USD Trip", currency_code="USD")
        TripMember.objects.create(
            trip=usd_trip,
            user=self.captain,
            role=TripRole.CAPTAIN,
            status=MemberStatus.ACTIVE,
        )
        usd_expenses_url = f"/api/trips/{usd_trip.id}/expenses"

        response = self.client.get(usd_expenses_url, **_auth(self.captain))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["currency_code"], "USD")
        self.assertEqual(response.data["expenses"], [])

    def test_invalid_amount_returns_400_without_creating_expense(self):
        response = self.client.post(
            self.expenses_url,
            {"title": "Bad Dinner", "total_amount": "-1"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["total_amount"][0].code, "min_value")

    def test_create_with_active_member_collector_sets_dashboard_collector(self):
        response = self.client.post(
            self.expenses_url,
            {
                "title": "Hotel",
                "total_amount": "600000",
                "collector_id": str(self.member.id),
            },
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 201)
        expense = Expense.objects.get(pk=response.data["id"])
        self.assertEqual(expense.collector, self.member)

        dashboard_response = self.client.get(self.expenses_url, **_auth(self.captain))

        self.assertEqual(dashboard_response.status_code, 200)
        self.assertEqual(
            dashboard_response.data["expenses"][0]["collector"]["id"],
            str(self.member.id),
        )

    def test_create_with_outsider_collector_returns_non_500_error_code(self):
        outsider = create_completed_user(
            "expense-outsider@example.com",
            "expenseoutsider",
            "EXO001",
            display_name="Expense Outsider",
        )

        response = self.client.post(
            self.expenses_url,
            {
                "title": "Hotel",
                "total_amount": "600000",
                "collector_id": str(outsider.id),
            },
            format="json",
            **_auth(self.captain),
        )

        self.assertIn(response.status_code, {400, 409})
        self.assertIn("error_code", response.data)
        self.assertFalse(Expense.objects.exists())

    def test_cancelled_trip_create_expense_returns_terminal_conflict(self):
        self.trip.status = TripStatus.CANCELLED
        self.trip.save(update_fields=["status"])

        response = self.client.post(
            self.expenses_url,
            {"title": "Dinner", "total_amount": "600000"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "TRIP_TERMINAL")

    def test_locked_expense_contribution_returns_conflict(self):
        expense_response = self.client.post(
            self.expenses_url,
            {"title": "Dinner", "total_amount": "600000"},
            format="json",
            **_auth(self.captain),
        )
        expense = Expense.objects.get(pk=expense_response.data["id"])
        expense.locked_at = timezone.now()
        expense.save(update_fields=["locked_at"])

        response = self.client.patch(
            f"{self.expenses_url}/{expense.id}/contributions/{self.member.id}",
            {"amount": "300000"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "EXPENSE_LOCKED")

    def test_contribution_target_outside_participant_snapshot_returns_conflict(self):
        outsider = create_completed_user(
            "expense-contribution-outsider@example.com",
            "expensecontribout",
            "ECO001",
            display_name="Contribution Outsider",
        )
        expense_response = self.client.post(
            self.expenses_url,
            {"title": "Dinner", "total_amount": "600000"},
            format="json",
            **_auth(self.captain),
        )

        response = self.client.patch(
            f"{self.expenses_url}/{expense_response.data['id']}/contributions/{outsider.id}",
            {"amount": "300000"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "CONTRIBUTION_USER_NOT_PARTICIPANT")
        self.assertFalse(ExpenseContribution.objects.exists())

    def test_decimal_currency_amounts_are_not_scientific_notation(self):
        usd_trip = _make_trip(self.captain, name="USD Expense Trip", currency_code="USD")
        TripMember.objects.create(
            trip=usd_trip,
            user=self.captain,
            role=TripRole.CAPTAIN,
            status=MemberStatus.ACTIVE,
        )
        TripMember.objects.create(
            trip=usd_trip,
            user=self.member,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        usd_expenses_url = f"/api/trips/{usd_trip.id}/expenses"

        create_response = self.client.post(
            usd_expenses_url,
            {"title": "Coffee", "total_amount": "10.50"},
            format="json",
            **_auth(self.captain),
        )
        dashboard_response = self.client.get(usd_expenses_url, **_auth(self.captain))

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(create_response.data["total_amount"], "10.50")
        self.assertNotIn("E", create_response.data["total_amount"].upper())
        self.assertEqual(dashboard_response.status_code, 200)
        self.assertEqual(dashboard_response.data["summary"]["total_amount"], "10.50")
        self.assertEqual(dashboard_response.data["summary"]["paid_amount"], "0.00")
        self.assertNotIn(
            "E",
            dashboard_response.data["expenses"][0]["total_amount"].upper(),
        )
        self.assertNotIn("E", dashboard_response.data["summary"]["total_amount"].upper())

    def test_captain_updates_unlocked_expense_and_recomputes_snapshot_shares(self):
        collector = create_completed_user(
            "expense-new-collector@example.com",
            "expensenewcollector",
            "ENC001",
            display_name="New Collector",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=collector,
            role=TripRole.MEMBER,
            status=MemberStatus.ACTIVE,
        )
        expense_response = self.client.post(
            self.expenses_url,
            {"title": "Dinner", "description": "Old", "total_amount": "600000"},
            format="json",
            **_auth(self.captain),
        )
        expense_id = expense_response.data["id"]

        response = self.client.patch(
            f"{self.expenses_url}/{expense_id}",
            {
                "title": "Updated dinner",
                "description": "New plan",
                "total_amount": "900000",
                "collector_id": str(collector.id),
            },
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "Updated dinner")
        self.assertEqual(response.data["description"], "New plan")
        self.assertEqual(response.data["total_amount"], "900000")
        self.assertEqual(response.data["collector"]["id"], str(collector.id))
        self.assertEqual(
            [participant["share_amount"] for participant in response.data["participants"]],
            ["300000", "300000", "300000"],
        )
        self.assertTrue(
            ExpenseLedgerEntry.objects.filter(
                event_type=ExpenseLedgerEventType.EXPENSE_UPDATED,
                expense_id=expense_id,
            ).exists()
        )

    def test_update_expense_rejects_locked_expense(self):
        expense_response = self.client.post(
            self.expenses_url,
            {"title": "Dinner", "total_amount": "600000"},
            format="json",
            **_auth(self.captain),
        )
        expense = Expense.objects.get(pk=expense_response.data["id"])
        expense.locked_at = timezone.now()
        expense.save(update_fields=["locked_at"])

        response = self.client.patch(
            f"{self.expenses_url}/{expense.id}",
            {"title": "Updated dinner"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "EXPENSE_LOCKED")

    def test_captain_deletes_unlocked_expense(self):
        expense_response = self.client.post(
            self.expenses_url,
            {"title": "Dinner", "total_amount": "600000"},
            format="json",
            **_auth(self.captain),
        )
        expense_id = expense_response.data["id"]

        response = self.client.delete(
            f"{self.expenses_url}/{expense_id}",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Expense.objects.filter(pk=expense_id).exists())
        self.assertTrue(
            ExpenseLedgerEntry.objects.filter(
                event_type=ExpenseLedgerEventType.EXPENSE_DELETED,
                payload__expense_id=expense_id,
            ).exists()
        )

    def test_delete_expense_rejects_locked_expense(self):
        expense_response = self.client.post(
            self.expenses_url,
            {"title": "Dinner", "total_amount": "600000"},
            format="json",
            **_auth(self.captain),
        )
        expense = Expense.objects.get(pk=expense_response.data["id"])
        expense.locked_at = timezone.now()
        expense.save(update_fields=["locked_at"])

        response = self.client.delete(
            f"{self.expenses_url}/{expense.id}",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "EXPENSE_LOCKED")
        self.assertTrue(Expense.objects.filter(pk=expense.id).exists())
