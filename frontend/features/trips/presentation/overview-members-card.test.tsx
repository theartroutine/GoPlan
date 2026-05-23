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

  it("renders captain hero, visible member names, and a crew cluster", () => {
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
    // 1 captain hero row + 3 featured rows + 1 compact crew avatar = 5 slots
    expect(container.querySelectorAll("[data-member-row]").length).toBe(5);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
    expect(screen.getByText("Dave")).toBeInTheDocument();
    // Remaining members stay compact in the crew cluster.
    expect(container.querySelector('[title="Eve"]')).not.toBeNull();
    expect(screen.queryByText(/\+\d+ more/)).toBeNull();
  });

  it("truncates the list and shows +N more link when count exceeds threshold", () => {
    const members = [
      buildMember("0", "User0", "CAPTAIN"),
      ...Array.from({ length: 11 }, (_, i) =>
        buildMember(`${i + 1}`, `User${i + 1}`),
      ),
    ];
    const { container } = render(
      <OverviewMembersCard tripId="trip-1" members={members} />,
    );
    expect(screen.getByText("12 members")).toBeInTheDocument();
    expect(screen.getByText("User1")).toBeInTheDocument();
    expect(screen.getByText("User2")).toBeInTheDocument();
    expect(screen.getByText("User3")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-member-row]").length).toBe(9);
    const more = screen.getByRole("link", { name: /\+3 more/ });
    expect(more).toHaveAttribute("href", "/trips/trip-1/members");
  });
});
