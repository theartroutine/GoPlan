import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OverviewMembersCard } from "./overview-members-card";
import type { TripMemberItem } from "@/features/trips/domain/types";

function buildMember(id: string, displayName: string): TripMemberItem {
  return {
    membership_id: `m-${id}`,
    role: "MEMBER",
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
  it("shows invite CTA when only one member", () => {
    render(
      <OverviewMembersCard
        tripId="trip-1"
        members={[buildMember("1", "Alice")]}
      />,
    );
    expect(screen.getByText("1 member")).toBeInTheDocument();
    expect(screen.getByText(/Invite members/i)).toBeInTheDocument();
  });

  it("renders all avatars when count is between 2 and 11", () => {
    const members = Array.from({ length: 5 }, (_, i) => buildMember(`${i}`, `User${i}`));
    const { container } = render(
      <OverviewMembersCard tripId="trip-1" members={members} />,
    );
    expect(screen.getByText("5 members")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-member-tile]").length).toBe(5);
  });

  it("renders 11 avatars and a '+N more' tile when count exceeds 12", () => {
    const members = Array.from({ length: 15 }, (_, i) => buildMember(`${i}`, `User${i}`));
    const { container } = render(
      <OverviewMembersCard tripId="trip-1" members={members} />,
    );
    expect(screen.getByText("15 members")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-member-tile]").length).toBe(11);
    const link = screen.getByRole("link", { name: /\+4 more/ });
    expect(link).toHaveAttribute("href", "/trips/trip-1/members");
  });
});
