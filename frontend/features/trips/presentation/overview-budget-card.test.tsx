import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OverviewBudgetCard } from "./overview-budget-card";

describe("OverviewBudgetCard", () => {
  it("returns null when budgetEstimate is empty", () => {
    const { container } = render(
      <OverviewBudgetCard
        budgetEstimate={null}
        currencyCode="VND"
        memberCount={4}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders total and per-person amount", () => {
    render(
      <OverviewBudgetCard
        budgetEstimate="4000000.00"
        currencyCode="VND"
        memberCount={4}
      />,
    );
    // VND uses vi-VN locale → thousand separator is "."
    expect(screen.getByText(/4\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText(/per person/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.000\.000/)).toBeInTheDocument();
  });

  it("renders total without per-person when memberCount is 0", () => {
    render(
      <OverviewBudgetCard
        budgetEstimate="500000.00"
        currencyCode="VND"
        memberCount={0}
      />,
    );
    expect(screen.getByText(/500\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/per person/i)).toBeNull();
  });
});
