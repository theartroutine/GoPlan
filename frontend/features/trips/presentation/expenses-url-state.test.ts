import { describe, expect, it } from "vitest";

import type { ExpenseListItem } from "@/features/trips/domain/expenses-types";
import { buildExpenseListItem } from "@/features/trips/presentation/expenses-test-helpers";
import {
  buildExpensesHref,
  filterExpenses,
  getNearestExpenseIdAfterDelete,
  resolveExpensesUrlState,
} from "@/features/trips/presentation/expenses-url-state";

function expense(overrides: Partial<ExpenseListItem>): ExpenseListItem {
  return buildExpenseListItem(overrides);
}

describe("expenses-url-state", () => {
  const expenses = [
    expense({
      id: "expense-funded",
      title: "Book Xe",
      description: "Phuong Trang",
      status: "FUNDED",
      missing_amount: "0",
      surplus_amount: "0",
      collector: { id: "collector-minh", display_name: "Minh Duong", identify_tag: "#MINH" },
    }),
    expense({
      id: "expense-missing",
      title: "Hotel deposit",
      status: "UNDERFUNDED",
      missing_amount: "2200000",
      surplus_amount: "0",
      collector: { id: "collector-an", display_name: "An Nguyen", identify_tag: "#AN" },
    }),
    expense({
      id: "expense-over",
      title: "Tiền bia",
      status: "OVERFUNDED",
      missing_amount: "0",
      surplus_amount: "100000",
      collector: { id: "collector-linh", display_name: "Linh Tran", identify_tag: "#LINH" },
    }),
  ];

  it("filters expenses by attention, missing, overfunded, and search query", () => {
    expect(filterExpenses(expenses, "all", "").map((item) => item.id)).toEqual([
      "expense-funded",
      "expense-missing",
      "expense-over",
    ]);
    expect(filterExpenses(expenses, "attention", "").map((item) => item.id)).toEqual([
      "expense-missing",
      "expense-over",
    ]);
    expect(filterExpenses(expenses, "missing", "").map((item) => item.id)).toEqual([
      "expense-missing",
    ]);
    expect(filterExpenses(expenses, "overfunded", "").map((item) => item.id)).toEqual([
      "expense-over",
    ]);
    expect(filterExpenses(expenses, "all", "minh").map((item) => item.id)).toEqual([
      "expense-funded",
    ]);
    expect(filterExpenses(expenses, "all", "phuong").map((item) => item.id)).toEqual([
      "expense-funded",
    ]);
  });

  it("resolves selected expense and canonical replacement href from query state", () => {
    expect(
      resolveExpensesUrlState({
        pathname: "/trips/trip-1/expenses",
        search: "expense=expense-over&filter=attention&q=bia",
        expenses,
      }),
    ).toMatchObject({
      selectedExpenseId: "expense-over",
      filter: "attention",
      query: "bia",
      replacementHref: null,
    });

    expect(
      resolveExpensesUrlState({
        pathname: "/trips/trip-1/expenses",
        search: "expense=missing-id&filter=bad&q=hotel",
        expenses,
      }),
    ).toMatchObject({
      selectedExpenseId: "expense-missing",
      filter: "all",
      query: "hotel",
      replacementHref: "/trips/trip-1/expenses?expense=expense-missing&q=hotel",
    });
  });

  it("builds hrefs while preserving unrelated query params and omitting defaults", () => {
    expect(
      buildExpensesHref("/trips/trip-1/expenses", "tab=expenses", {
        expenseId: "expense-over",
        filter: "attention",
        query: "bia",
      }),
    ).toBe("/trips/trip-1/expenses?tab=expenses&expense=expense-over&filter=attention&q=bia");

    expect(
      buildExpensesHref("/trips/trip-1/expenses", "filter=attention&q=bia", {
        expenseId: null,
        filter: "all",
        query: "",
      }),
    ).toBe("/trips/trip-1/expenses");
  });

  it("selects the nearest visible expense after deleting the current expense", () => {
    expect(getNearestExpenseIdAfterDelete(expenses, "expense-missing")).toBe("expense-over");
    expect(getNearestExpenseIdAfterDelete(expenses, "expense-over")).toBe("expense-missing");
    expect(getNearestExpenseIdAfterDelete([expenses[0]], "expense-funded")).toBeNull();
    expect(getNearestExpenseIdAfterDelete(expenses, "missing-id")).toBe("expense-funded");
  });
});
