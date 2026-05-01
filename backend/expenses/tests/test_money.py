from __future__ import annotations

from decimal import Decimal

from django.test import SimpleTestCase

from expenses.services import (
    ExpenseServiceError,
    MAX_OPTIMAL_SETTLEMENT_PARTICIPANTS,
    build_settlement_transfers,
    split_amount_evenly,
)


class MoneyHelperTests(SimpleTestCase):
    def test_split_amount_evenly_distributes_vnd_remainder_deterministically(self):
        shares = split_amount_evenly(
            Decimal("1000000"),
            ["a", "b", "c"],
            currency_code="VND",
        )

        self.assertEqual(
            shares,
            [Decimal("333334"), Decimal("333333"), Decimal("333333")],
        )

    def test_split_amount_evenly_distributes_two_decimal_currency_remainder(self):
        shares = split_amount_evenly(
            Decimal("10.00"),
            ["a", "b", "c"],
            currency_code="USD",
        )

        self.assertEqual(
            shares,
            [Decimal("3.34"), Decimal("3.33"), Decimal("3.33")],
        )

    def test_build_settlement_transfers_nets_debtors_to_creditors(self):
        balances = {
            "A": Decimal("-300000"),
            "B": Decimal("0"),
            "C": Decimal("300000"),
            "D": Decimal("100000"),
            "E": Decimal("-100000"),
        }

        transfers = build_settlement_transfers(balances)

        self.assertEqual(
            transfers,
            [
                {"payer": "A", "recipient": "C", "amount": Decimal("300000")},
                {"payer": "E", "recipient": "D", "amount": Decimal("100000")},
            ],
        )

    def test_build_settlement_transfers_uses_minimal_exact_match_groups(self):
        balances = {
            "A": Decimal("-3"),
            "B": Decimal("-2"),
            "C": Decimal("2"),
            "D": Decimal("3"),
        }

        transfers = build_settlement_transfers(balances)

        self.assertEqual(
            transfers,
            [
                {"payer": "A", "recipient": "D", "amount": Decimal("3")},
                {"payer": "B", "recipient": "C", "amount": Decimal("2")},
            ],
        )

    def test_build_settlement_transfers_rejects_unbalanced_balances(self):
        with self.assertRaisesMessage(
            ExpenseServiceError,
            "Settlement balances must net to zero.",
        ):
            build_settlement_transfers(
                {
                    "A": Decimal("-100"),
                    "B": Decimal("70"),
                }
            )

    def test_build_settlement_transfers_returns_empty_for_all_zero_balances(self):
        transfers = build_settlement_transfers(
            {
                "A": Decimal("0"),
                "B": Decimal("0"),
            }
        )

        self.assertEqual(transfers, [])

    def test_build_settlement_transfers_rejects_more_than_safe_optimization_cap(self):
        balances = {
            **{
                f"debtor-{index}": Decimal("-1")
                for index in range(MAX_OPTIMAL_SETTLEMENT_PARTICIPANTS // 2 + 1)
            },
            **{
                f"creditor-{index}": Decimal("1")
                for index in range(MAX_OPTIMAL_SETTLEMENT_PARTICIPANTS // 2)
            },
            "large-creditor": Decimal("1"),
        }

        with self.assertRaisesMessage(
            ExpenseServiceError,
            "Settlement has too many non-zero balances to optimize safely.",
        ):
            build_settlement_transfers(balances)

    def test_build_settlement_transfers_allows_safe_optimization_cap_boundary(self):
        balances = {
            **{
                f"debtor-{index}": Decimal("-1")
                for index in range(MAX_OPTIMAL_SETTLEMENT_PARTICIPANTS // 2)
            },
            **{
                f"creditor-{index}": Decimal("1")
                for index in range(MAX_OPTIMAL_SETTLEMENT_PARTICIPANTS // 2)
            },
        }

        transfers = build_settlement_transfers(balances)

        self.assertEqual(len(transfers), MAX_OPTIMAL_SETTLEMENT_PARTICIPANTS // 2)
        self.assertEqual(
            sum(transfer["amount"] for transfer in transfers),
            Decimal(MAX_OPTIMAL_SETTLEMENT_PARTICIPANTS // 2),
        )
