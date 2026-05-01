import type {
  ExpenseDashboardResponse,
  ExpenseListItem,
  ExpenseMoneySummary,
  ExpensePerson,
  SettlementTransfer,
  TripSettlement,
} from "@/features/trips/domain/expenses-types";

export function buildExpensePerson(overrides: Partial<ExpensePerson> = {}): ExpensePerson {
  return {
    id: "user-collector",
    display_name: "Minh Nguyen",
    identify_tag: "@minh",
    ...overrides,
  };
}

export function buildExpenseListItem(overrides: Partial<ExpenseListItem> = {}): ExpenseListItem {
  return {
    id: "expense-food",
    title: "Dinner in Da Nang",
    description: "Seafood dinner for the group",
    currency_code: "VND",
    total_amount: "1200000.00",
    paid_amount: "800000.00",
    missing_amount: "400000.00",
    surplus_amount: "0.00",
    status: "UNDERFUNDED",
    collector: buildExpensePerson(),
    locked: false,
    ...overrides,
  };
}

export function buildExpenseSummary(overrides: Partial<ExpenseMoneySummary> = {}): ExpenseMoneySummary {
  return {
    total_amount: "1200000.00",
    paid_amount: "800000.00",
    missing_amount: "400000.00",
    surplus_amount: "0.00",
    ...overrides,
  };
}

export function buildExpenseDashboardResponse(
  overrides: Partial<ExpenseDashboardResponse> = {},
): ExpenseDashboardResponse {
  const expenses = overrides.expenses ?? [buildExpenseListItem()];

  return {
    summary: buildExpenseSummary(overrides.summary),
    permissions: { can_manage_expenses: false, ...overrides.permissions },
    my_balance: { balance: "-300000.00", ...overrides.my_balance },
    member_balances: overrides.member_balances ?? {},
    expenses,
    settlement: overrides.settlement ?? null,
  };
}

export function buildSettlementTransfer(
  overrides: Partial<SettlementTransfer> = {},
): SettlementTransfer {
  return {
    id: "transfer-1",
    payer: buildExpensePerson({
      id: "user-payer",
      display_name: "Payer User",
      identify_tag: "@payer",
    }),
    recipient: buildExpensePerson({
      id: "user-recipient",
      display_name: "Recipient User",
      identify_tag: "@recipient",
    }),
    amount: "300000.00",
    payer_marked_sent_at: null,
    recipient_confirmed_at: null,
    ...overrides,
  };
}

export function buildTripSettlement(overrides: Partial<TripSettlement> = {}): TripSettlement {
  return {
    id: "settlement-1",
    status: "FINALIZED",
    finalized_at: "2026-05-01T12:00:00Z",
    transfers: [buildSettlementTransfer()],
    ...overrides,
  };
}
