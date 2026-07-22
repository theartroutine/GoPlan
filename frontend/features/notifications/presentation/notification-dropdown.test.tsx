import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Notification } from "@/features/notifications/domain/types";

const notificationsContextMock = vi.hoisted(() => ({
  useNotifications: vi.fn(),
}));

const tripsApiMock = vi.hoisted(() => ({
  bffAcceptInvitation: vi.fn(),
  bffDeclineInvitation: vi.fn(),
}));

const routerMock = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock(
  "@/features/notifications/application/notifications-context",
  () => notificationsContextMock,
);
vi.mock(
  "@/features/trips/infrastructure/trips-api",
  () => tripsApiMock,
);
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

import { NotificationDropdown } from "@/features/notifications/presentation/notification-dropdown";

function makeTripInvitationNotification(): Notification {
  return {
    id: "notification-1",
    notification_type: "TRIP_INVITATION",
    actor: {
      id: "captain-1",
      display_name: "Minh",
      identify_tag: "minh#1234",
    },
    payload: {
      trip_id: "trip-1",
      trip_name: "Da Nang Getaway",
      destination: "Da Nang",
      start_date: "2026-08-01",
      end_date: "2026-08-05",
      invitation_id: "invitation-1",
      invitation_status: "PENDING",
    },
    is_read: false,
    read_at: null,
    created_at: "2026-07-22T10:00:00.000Z",
  };
}

function deferredMutation() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {
    promise,
    resolve: () => resolve?.(),
  };
}

const markReadMock = vi.fn().mockResolvedValue(undefined);
const confirmTripInvitationStatusMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  markReadMock.mockResolvedValue(undefined);
  notificationsContextMock.useNotifications.mockReturnValue({
    unreadCount: 1,
    notifications: [makeTripInvitationNotification()],
    isLoading: false,
    hasMore: false,
    isListLoaded: true,
    fetchNotifications: vi.fn().mockResolvedValue(undefined),
    loadMore: vi.fn().mockResolvedValue(undefined),
    markRead: markReadMock,
    markAllRead: vi.fn().mockResolvedValue(undefined),
    confirmTripInvitationStatus: confirmTripInvitationStatusMock,
  });
});

describe("NotificationDropdown", () => {
  it("records an accepted status only after the invitation mutation succeeds", async () => {
    const mutation = deferredMutation();
    tripsApiMock.bffAcceptInvitation.mockReturnValue(mutation.promise);

    render(<NotificationDropdown />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(confirmTripInvitationStatusMock).not.toHaveBeenCalled();
    expect(markReadMock).not.toHaveBeenCalled();

    mutation.resolve();

    await waitFor(() => {
      expect(confirmTripInvitationStatusMock).toHaveBeenCalledWith(
        "notification-1",
        "ACCEPTED",
      );
    });
    expect(markReadMock).toHaveBeenCalledWith("notification-1");
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it("records a declined status only after the invitation mutation succeeds", async () => {
    const mutation = deferredMutation();
    tripsApiMock.bffDeclineInvitation.mockReturnValue(mutation.promise);

    render(<NotificationDropdown />);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(confirmTripInvitationStatusMock).not.toHaveBeenCalled();
    expect(markReadMock).not.toHaveBeenCalled();

    mutation.resolve();

    await waitFor(() => {
      expect(confirmTripInvitationStatusMock).toHaveBeenCalledWith(
        "notification-1",
        "DECLINED",
      );
    });
    expect(markReadMock).toHaveBeenCalledWith("notification-1");
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("does not record a terminal status when the invitation mutation fails", async () => {
    tripsApiMock.bffAcceptInvitation.mockRejectedValue(
      new Error("mutation failed"),
    );

    render(<NotificationDropdown />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(
        screen.getByText("Failed to accept invitation. Please try again."),
      ).not.toBeNull();
    });
    expect(confirmTripInvitationStatusMock).not.toHaveBeenCalled();
    expect(markReadMock).not.toHaveBeenCalled();
  });
});
