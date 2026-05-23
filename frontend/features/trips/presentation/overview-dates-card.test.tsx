import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OverviewDatesCard } from "./overview-dates-card";

describe("OverviewDatesCard", () => {
  it("renders date range and day span", () => {
    render(
      <OverviewDatesCard
        start="2026-05-30"
        end="2026-06-02"
        status="PLANNING"
        today="2026-05-18"
      />,
    );
    expect(screen.getByText(/May 30/)).toBeInTheDocument();
    expect(screen.getByText(/Jun 2, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/4 days/)).toBeInTheDocument();
  });

  it("shows 'D-12 days to go' for future trips", () => {
    render(
      <OverviewDatesCard
        start="2026-05-30"
        end="2026-06-02"
        status="PLANNING"
        today="2026-05-18"
      />,
    );
    expect(screen.getByText("D-12 days to go")).toBeInTheDocument();
  });

  it("shows 'Trip in progress' when ongoing", () => {
    render(
      <OverviewDatesCard
        start="2026-05-15"
        end="2026-05-22"
        status="ONGOING"
        today="2026-05-18"
      />,
    );
    expect(screen.getByText("Trip in progress")).toBeInTheDocument();
  });

  it("shows 'Ended N days ago' for past trips", () => {
    render(
      <OverviewDatesCard
        start="2026-05-01"
        end="2026-05-10"
        status="COMPLETED"
        today="2026-05-18"
      />,
    );
    expect(screen.getByText("Ended 8 days ago")).toBeInTheDocument();
  });

  it("shows 'Trip cancelled' when status is CANCELLED", () => {
    render(
      <OverviewDatesCard
        start="2026-05-30"
        end="2026-06-02"
        status="CANCELLED"
        today="2026-05-18"
      />,
    );
    expect(screen.getByText("Trip cancelled")).toBeInTheDocument();
  });
});
