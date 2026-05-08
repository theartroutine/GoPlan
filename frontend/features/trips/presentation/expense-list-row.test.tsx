import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { formatExpenseMoney } from "@/features/trips/domain/expenses-money";
import { buildExpenseListItem } from "@/features/trips/presentation/expenses-test-helpers";
import { ExpenseListRow } from "@/features/trips/presentation/expense-list-row";

describe("ExpenseListRow", () => {
  it("renders compact row data and emits selection", () => {
    const onSelect = vi.fn();

    render(
      <ExpenseListRow
        expense={buildExpenseListItem({
          id: "expense-over",
          title: "Tiền bia",
          description: "Late night drinks",
          status: "OVERFUNDED",
          total_amount: "1000000",
          paid_amount: "1100000",
          missing_amount: "0",
          surplus_amount: "100000",
          collector: { id: "user-minh", display_name: "Minh Duong", identify_tag: "#MINH" },
        })}
        selected={true}
        onSelect={onSelect}
      />,
    );

    const row = screen.getByRole("button", { name: "Open Tiền bia" });
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Tiền bia")).not.toBeNull();
    expect(screen.getByText(byNormalizedText(formatExpenseMoney("1000000", "VND")))).not.toBeNull();
    expect(screen.getByText(byNormalizedText(formatExpenseMoney("1100000", "VND")))).not.toBeNull();
    expect(screen.getByText("Overfunded")).not.toBeNull();
    expect(screen.getByText("Minh Duong")).not.toBeNull();
    expect(screen.getByText("#MINH")).not.toBeNull();
    expect(screen.getByText(/Surplus/)).not.toBeNull();

    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("shows locked state accessibly", () => {
    render(
      <ExpenseListRow
        expense={buildExpenseListItem({ title: "Hotel deposit", locked: true })}
        selected={false}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Locked")).not.toBeNull();
  });
});

function byNormalizedText(expected: string) {
  return (content: string) => normalizeText(content) === normalizeText(expected);
}

function normalizeText(value: string): string {
  return value.replace(/\s/g, " ");
}
