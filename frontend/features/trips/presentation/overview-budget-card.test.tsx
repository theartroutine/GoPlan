import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OverviewBudgetCard } from "./overview-budget-card";

describe("OverviewBudgetCard", () => {
  it("renders empty state with Set a budget link when budgetEstimate is null", () => {
    render(
      <OverviewBudgetCard
        tripId="trip-1"
        budgetEstimate={null}
        currencyCode="VND"
        memberCount={4}
      />,
    );
    expect(screen.getByText(/Not set yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Set a budget/i })).toHaveAttribute(
      "href",
      "/trips/trip-1/edit",
    );
  });

  it("renders total and per-person amount", () => {
    render(
      <OverviewBudgetCard
        tripId="trip-1"
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

  it("hints to add members when memberCount is 0", () => {
    render(
      <OverviewBudgetCard
        tripId="trip-1"
        budgetEstimate="500000.00"
        currencyCode="VND"
        memberCount={0}
      />,
    );
    expect(screen.getByText(/500\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Add members to split/i)).toBeInTheDocument();
  });
});
