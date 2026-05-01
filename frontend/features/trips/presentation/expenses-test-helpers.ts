import type {
  ExpenseDashboardResponse,
  ExpenseListItem,
  ExpenseMoneySummary,
  ExpensePerson,
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
