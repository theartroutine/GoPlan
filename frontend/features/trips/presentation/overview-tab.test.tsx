import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const tripContextValue = {
  tripId: "trip-1",
  data: {
    trip: {
      id: "trip-1",
      name: "Trip",
      destination: "Da Lat",
      cover_image_url: null as string | null,
      status: "PLANNING" as const,
      start_date: "2026-05-30",
      end_date: "2026-06-02",
      budget_estimate: null as string | null,
      currency_code: "VND",
      description: "" as string,
    },
    members: [
      {
        membership_id: "m-1",
        role: "CAPTAIN" as const,
        joined_at: "2026-05-01T00:00:00Z",
        user: {
          id: "u-1",
          display_name: "Alice",
          identify_tag: "alice",
          avatar_url: null,
        },
      },
    ],
    my_membership: { role: "CAPTAIN" as const, status: "ACTIVE", joined_at: "" },
  },
  loading: false,
  error: null,
  notFound: false,
  refresh: vi.fn(),
};

vi.mock("@/features/trips/presentation/trip-context", () => ({
  useTripContext: () => tripContextValue,
}));

import { OverviewTab } from "./overview-tab";

describe("OverviewTab", () => {
  it("renders Dates + Members; skips Budget and Description when absent", () => {
    tripContextValue.data.trip.budget_estimate = null;
    tripContextValue.data.trip.description = "";
    render(<OverviewTab />);
    expect(screen.getByText(/May 30/)).toBeInTheDocument();
    expect(screen.getByText(/1 member/i)).toBeInTheDocument();
    expect(screen.queryByText(/per person/i)).toBeNull();
    expect(screen.queryByText(/^About$/)).toBeNull();
  });

  it("renders Budget and Description when present", () => {
    tripContextValue.data.trip.budget_estimate = "4000000.00";
    tripContextValue.data.trip.description = "We will fly out together.";
    render(<OverviewTab />);
    expect(screen.getByText(/per person/i)).toBeInTheDocument();
    expect(screen.getByText(/^About$/)).toBeInTheDocument();
    expect(screen.getByText("We will fly out together.")).toBeInTheDocument();
  });
});
