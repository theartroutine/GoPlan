import { fireEvent, render, screen } from "@testing-library/react";
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
});
