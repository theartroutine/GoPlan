import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMock = vi.hoisted(() => ({
  pathname: "/trips/trip-1/photos",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => ({ push: navigationMock.push }),
}));

vi.mock("@/features/trips/presentation/trip-context", () => ({
  useTripContext: () => ({
    tripId: "trip-1",
    data: {
      trip: { status: "PLANNING" },
      my_membership: { role: "CAPTAIN" },
    },
  }),
}));

import { TripTabBar } from "@/features/trips/presentation/trip-tab-bar";

describe("TripTabBar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    navigationMock.pathname = "/trips/trip-1/photos";
  });

  it("includes a Photos tab inside trips", () => {
    render(<TripTabBar />);

    expect(screen.getByRole("link", { name: "Photos" })).toHaveAttribute(
      "href",
      "/trips/trip-1/photos",
    );
  });
});
