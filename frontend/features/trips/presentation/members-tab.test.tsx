import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripDetailResponse } from "@/features/trips/domain/types";

const tripsApiMock = vi.hoisted(() => ({
  bffGetInvitations: vi.fn(),
  bffRemoveMember: vi.fn(),
}));

const tripContextMock = vi.hoisted(() => ({
  useTripContext: vi.fn(),
}));

vi.mock("@/features/trips/infrastructure/trips-api", () => tripsApiMock);
vi.mock("@/features/trips/presentation/trip-context", () => tripContextMock);

import { MembersTab } from "@/features/trips/presentation/members-tab";

function makeTripDetailResponse(): TripDetailResponse {
  return {
    trip: {
      id: "trip-1",
      name: "Da Nang",
      destination: "Da Nang",
      destination_provider: "",
      destination_provider_id: "",
      destination_lat: null,
      destination_lng: null,
      destination_country_code: "",
      cover_image_url: "",
      start_date: "2026-06-01",
      end_date: "2026-06-05",
      description: "",
      status: "PLANNING",
      currency_code: "VND",
      timezone: "Asia/Ho_Chi_Minh",
      budget_estimate: null,
      cancelled_at: null,
      created_at: "2026-05-01T00:00:00Z",
    },
    my_membership: {
      role: "CAPTAIN",
      status: "ACTIVE",
      joined_at: "2026-05-01T00:00:00Z",
    },
    members: [
      {
        membership_id: "member-1",
        role: "CAPTAIN",
        joined_at: "2026-05-01T00:00:00Z",
        user: {
          id: "user-1",
          display_name: "Captain User",
          identify_tag: "captain#0001",
          avatar_url: null,
        },
      },
    ],
  };
}

describe("MembersTab", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tripContextMock.useTripContext.mockReturnValue({
      tripId: "trip-1",
      data: makeTripDetailResponse(),
      loading: false,
      error: null,
      notFound: false,
      refresh: vi.fn(),
    });
  });

  it("shows a scoped error when pending invitation loading is throttled", async () => {
    tripsApiMock.bffGetInvitations.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status 429"), {
        isAxiosError: true,
        response: { status: 429 },
      }),
    );

    render(<MembersTab />);

    expect(
      await screen.findByText("Could not load pending invitations. Please try again."),
    ).not.toBeNull();
  });
});
