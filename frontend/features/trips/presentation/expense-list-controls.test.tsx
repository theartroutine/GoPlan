import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExpenseListControls } from "@/features/trips/presentation/expense-list-controls";

describe("ExpenseListControls", () => {
  it("renders filter counts and emits filter/search changes", () => {
    const onFilterChange = vi.fn();
    const onQueryChange = vi.fn();

    render(
      <ExpenseListControls
        filter="all"
        query=""
        counts={{ all: 3, attention: 2, missing: 1, overfunded: 1 }}
        onFilterChange={onFilterChange}
        onQueryChange={onQueryChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Need attention 2" }));
    expect(onFilterChange).toHaveBeenCalledWith("attention");

    fireEvent.change(screen.getByLabelText("Search expenses"), {
      target: { value: "bia" },
    });
    expect(onQueryChange).toHaveBeenCalledWith("bia");
  });
});
