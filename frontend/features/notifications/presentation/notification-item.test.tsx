import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Notification } from "@/features/notifications/domain/types";
import { NotificationItem } from "@/features/notifications/presentation/notification-item";

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

function buildNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notification-1",
    notification_type: "TRIP_TIMELINE_REMINDER",
    actor: null,
    payload: {
      trip_id: "trip-1",
      trip_name: "Da Lat Weekend",
      activity_id: "activity-1",
      activity_title: "Board train",
      section_label: "Day 1",
      activity_date: "2026-06-01",
      activity_time: "09:00",
      location_label: "Central station",
    },
    is_read: false,
    read_at: null,
    created_at: "2026-06-01T01:00:00Z",
    ...overrides,
  };
}

function buildTripInvitationNotification(invitationStatus: unknown): Notification {
  return buildNotification({
    notification_type: "TRIP_INVITATION",
    actor: {
      id: "captain-1",
      display_name: "Minh",
      identify_tag: "minh#1234",
    },
    payload: {
      invitation_id: "invitation-1",
      invitation_status: invitationStatus,
      trip_id: "trip-1",
      trip_name: "Da Nang Getaway",
      destination: "Da Nang",
      start_date: "2026-08-01",
      end_date: "2026-08-05",
    },
  });
}

describe("NotificationItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders timeline reminder notifications", () => {
    render(<NotificationItem notification={buildNotification()} onMarkRead={vi.fn()} />);

    expect(screen.getByText("Board train")).not.toBeNull();
    expect(screen.getByText("Da Lat Weekend")).not.toBeNull();
    expect(screen.getByText("Day 1 · 2026-06-01 · 09:00")).not.toBeNull();
    expect(screen.getByText("Central station")).not.toBeNull();
  });

  it("navigates timeline reminders to the target activity", () => {
    const onMarkRead = vi.fn();
    render(<NotificationItem notification={buildNotification()} onMarkRead={onMarkRead} />);

    fireEvent.click(screen.getByRole("button", { name: /Board train/i }));

    expect(onMarkRead).toHaveBeenCalledWith("notification-1");
    expect(routerMock.push).toHaveBeenCalledWith(
      "/trips/trip-1/timeline?activity=activity-1",
      { scroll: false },
    );
  });

  it("renders invitation actions only while the server status is pending", () => {
    render(
      <NotificationItem
        notification={buildTripInvitationNotification("PENDING")}
        onMarkRead={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Accept" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Decline" })).not.toBeNull();
  });

  it.each([
    ["ACCEPTED", "✓ You joined the trip"],
    ["DECLINED", "Invitation declined"],
    ["CANCELLED", "Invitation cancelled"],
  ])("renders durable %s invitation state without actions", (status, label) => {
    render(
      <NotificationItem
        notification={buildTripInvitationNotification(status)}
        onMarkRead={vi.fn()}
      />,
    );

    expect(screen.getByText(label)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  });

  it("renders a neutral non-actionable fallback for an unknown status", () => {
    render(
      <NotificationItem
        notification={buildTripInvitationNotification("EXPIRED")}
        onMarkRead={vi.fn()}
      />,
    );

    expect(screen.getByText("Trip invitation (details unavailable)")).not.toBeNull();
    expect(screen.queryByText("Da Nang Getaway")).toBeNull();
    expect(screen.queryByText("invitation-1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  });

  it("shows the accepted state immediately after a successful mutation", async () => {
    const onAcceptInvitation = vi.fn().mockResolvedValue(undefined);
    render(
      <NotificationItem
        notification={buildTripInvitationNotification("PENDING")}
        onMarkRead={vi.fn()}
        onAcceptInvitation={onAcceptInvitation}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(screen.getByText("✓ You joined the trip")).not.toBeNull();
    });
    expect(onAcceptInvitation).toHaveBeenCalledWith(
      "invitation-1",
      "notification-1",
    );
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  });
});
