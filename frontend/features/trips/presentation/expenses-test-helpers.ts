import type {
  ExpenseDashboardResponse,
  ExpenseDetailResponse,
  ExpenseListItem,
  ExpenseMoneySummary,
  ExpenseParticipantContribution,
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

export function buildExpenseParticipantContribution(
  overrides: Partial<ExpenseParticipantContribution> = {},
): ExpenseParticipantContribution {
  return {
    user_id: "user-collector",
    display_name: "Minh Nguyen",
    identify_tag: "@minh",
    share_amount: "600000.00",
    contributed_amount: "300000.00",
    balance: "-300000.00",
    ...overrides,
  };
}

export function buildExpenseDetailResponse(
  overrides: Partial<ExpenseDetailResponse> = {},
): ExpenseDetailResponse {
  const baseExpense = buildExpenseListItem(overrides);

  return {
    ...baseExpense,
    locked_at: overrides.locked_at ?? null,
    created_at: overrides.created_at ?? "2026-05-01T12:00:00Z",
    permissions: { can_manage_expenses: true, ...overrides.permissions },
    participants: overrides.participants ?? [
      buildExpenseParticipantContribution(),
      buildExpenseParticipantContribution({
        user_id: "user-member",
        display_name: "Linh Tran",
        identify_tag: "@linh",
      }),
    ],
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
    currency_code: overrides.currency_code ?? "VND",
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
