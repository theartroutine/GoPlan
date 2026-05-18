import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OverviewMembersCard } from "./overview-members-card";
import type { TripMemberItem } from "@/features/trips/domain/types";

function buildMember(
  id: string,
  displayName: string,
  role: TripMemberItem["role"] = "MEMBER",
): TripMemberItem {
  return {
    membership_id: `m-${id}`,
    role,
    joined_at: "2026-05-01T00:00:00Z",
    user: {
      id: `u-${id}`,
      display_name: displayName,
      identify_tag: id,
      avatar_url: null,
    },
  };
}

describe("OverviewMembersCard", () => {
  it("renders a single row with captain badge for one member", () => {
    render(
      <OverviewMembersCard
        tripId="trip-1"
        members={[buildMember("1", "Alice", "CAPTAIN")]}
      />,
    );
    expect(screen.getByText("1 member")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Captain")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Invite/i })).toHaveAttribute(
      "href",
      "/trips/trip-1/members",
    );
  });

  it("renders captain hero plus an avatar cluster for the rest when within threshold", () => {
    const members = [
      buildMember("0", "Alice", "CAPTAIN"),
      buildMember("1", "Bob"),
      buildMember("2", "Carol"),
      buildMember("3", "Dave"),
      buildMember("4", "Eve"),
    ];
    const { container } = render(
      <OverviewMembersCard tripId="trip-1" members={members} />,
    );
    expect(screen.getByText("5 members")).toBeInTheDocument();
    // 1 captain hero row + 4 cluster avatar tiles = 5 rendered member slots
    expect(container.querySelectorAll("[data-member-row]").length).toBe(5);
    // Captain is rendered as a hero row with visible name
    expect(screen.getByText("Alice")).toBeInTheDocument();
    // Other members are rendered as avatar tiles with names in title attributes
    expect(container.querySelector('[title="Eve"]')).not.toBeNull();
    expect(container.querySelector('[title="Bob"]')).not.toBeNull();
    expect(screen.queryByText(/\+\d+ more/)).toBeNull();
  });

  it("truncates the list and shows +N more link when count exceeds threshold", () => {
    const members = Array.from({ length: 8 }, (_, i) =>
      buildMember(`${i}`, `User${i}`),
    );
    const { container } = render(
      <OverviewMembersCard tripId="trip-1" members={members} />,
    );
    expect(screen.getByText("8 members")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-member-row]").length).toBe(5);
    const more = screen.getByRole("link", { name: /\+3 more/ });
    expect(more).toHaveAttribute("href", "/trips/trip-1/members");
  });
});
