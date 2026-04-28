import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripListResponse } from "@/features/trips/domain/types";

const tripsApiMock = vi.hoisted(() => ({
  bffListTrips: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/features/trips/infrastructure/trips-api", () => tripsApiMock);

import { DashboardContent } from "@/features/trips/presentation/dashboard-content";

function makeTripListResponse(): TripListResponse {
  return {
    next: null,
    previous: null,
    results: [
      {
        id: "trip-1",
        name: "Beach Escape",
        destination: "Da Nang",
        cover_image_url: "",
        start_date: "2026-06-01",
        end_date: "2026-06-05",
        status: "PLANNING",
        currency_code: "VND",
        budget_estimate: "5000000.00",
        member_count: 4,
        my_role: "CAPTAIN",
      },
    ],
  };
}

function makeAxiosError(status: number, data?: Record<string, unknown>) {
  return Object.assign(new Error(`Request failed with status ${status}`), {
    isAxiosError: true,
    response: {
      status,
      data,
      headers: {},
    },
  });
}

describe("DashboardContent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("retries transient soft-auth failures and renders trips after recovery", async () => {
    tripsApiMock.bffListTrips
      .mockRejectedValueOnce(
        makeAxiosError(401, { code: "refresh_auth_soft_failed" }),
      )
      .mockResolvedValueOnce(makeTripListResponse());

    render(<DashboardContent />);

    await waitFor(() => {
      expect(tripsApiMock.bffListTrips).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(tripsApiMock.bffListTrips).toHaveBeenCalledTimes(2);
    }, { timeout: 1000 });

    expect(await screen.findByText("Beach Escape")).not.toBeNull();
    expect(screen.queryByText("Failed to load trips.")).toBeNull();
  });

  it("formats non-VND trip budgets with the selected currency locale", async () => {
    tripsApiMock.bffListTrips.mockResolvedValueOnce({
      next: null,
      previous: null,
      results: [
        {
          id: "trip-2",
          name: "US Road Trip",
          destination: "California",
          cover_image_url: "",
          start_date: "2026-06-01",
          end_date: "2026-06-05",
          status: "PLANNING",
          currency_code: "USD",
          budget_estimate: "5000.00",
          member_count: 4,
          my_role: "CAPTAIN",
        },
      ],
    } satisfies TripListResponse);

    render(<DashboardContent />);

    expect(await screen.findByText("~1,250 USD/person")).not.toBeNull();
  });

  it("shows Try again after retries are exhausted and reloads trips on demand", async () => {
    tripsApiMock.bffListTrips
      .mockRejectedValueOnce(makeAxiosError(503))
      .mockRejectedValueOnce(makeAxiosError(503))
      .mockRejectedValueOnce(makeAxiosError(503))
      .mockResolvedValueOnce(makeTripListResponse());

    render(<DashboardContent />);

    await waitFor(() => {
      expect(tripsApiMock.bffListTrips).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(tripsApiMock.bffListTrips).toHaveBeenCalledTimes(3);
    }, { timeout: 1200 });

    expect(await screen.findByText("Failed to load trips.")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(tripsApiMock.bffListTrips).toHaveBeenCalledTimes(4);
    });

    expect(await screen.findByText("Beach Escape")).not.toBeNull();
  });
});
