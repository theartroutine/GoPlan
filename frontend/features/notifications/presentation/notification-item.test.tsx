import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Notification } from "@/features/notifications/domain/types";
import { NotificationItem } from "@/features/notifications/presentation/notification-item";

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
  it("renders timeline reminder notifications", () => {
    render(<NotificationItem notification={buildNotification()} onMarkRead={vi.fn()} />);

    expect(screen.getByText("Board train")).not.toBeNull();
    expect(screen.getByText("Da Lat Weekend")).not.toBeNull();
    expect(screen.getByText("Day 1 · 2026-06-01 · 09:00")).not.toBeNull();
    expect(screen.getByText("Central station")).not.toBeNull();
  });
});
