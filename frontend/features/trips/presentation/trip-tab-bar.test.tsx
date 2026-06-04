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

  it("includes a Memories tab between Photos and Chat", () => {
    render(<TripTabBar />);

    const links = screen.getAllByRole("link").map((link) => ({
      href: link.getAttribute("href"),
      name: link.textContent,
    }));

    expect(links).toEqual(
      expect.arrayContaining([
        { href: "/trips/trip-1/memories", name: "Memories" },
      ]),
    );
    expect(links.findIndex((link) => link.name === "Photos")).toBeLessThan(
      links.findIndex((link) => link.name === "Memories"),
    );
    expect(links.findIndex((link) => link.name === "Memories")).toBeLessThan(
      links.findIndex((link) => link.name === "Chat"),
    );
  });
});
