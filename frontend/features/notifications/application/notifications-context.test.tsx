import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Notification,
  NotificationListResponse,
  TripInvitationStatus,
} from "@/features/notifications/domain/types";
import type { WsMessage } from "@/features/realtime/domain/types";

const notificationsApiMock = vi.hoisted(() => ({
  bffNotificationsList: vi.fn(),
  bffUnreadCount: vi.fn(),
  bffMarkRead: vi.fn(),
  bffMarkAllRead: vi.fn(),
}));

const wsManagerMock = vi.hoisted(() => ({
  on: vi.fn(),
}));

vi.mock("@/features/notifications/infrastructure/notifications-api", () => notificationsApiMock);
vi.mock("@/features/realtime/infrastructure/ws-manager", () => ({
  wsManager: wsManagerMock,
}));

import {
  NotificationsProvider,
  useNotifications,
} from "@/features/notifications/application/notifications-context";

function makeNotification(id: string, isRead = false): Notification {
  return {
    id,
    notification_type: "FRIEND_REQUEST",
    actor: null,
    payload: {},
    is_read: isRead,
    read_at: isRead ? "2026-03-31T10:00:00.000Z" : null,
    created_at: `2026-03-31T10:00:0${id.length}.000Z`,
  };
}

function makeListResponse(
  notifications: Notification[],
  nextCursor: string | null = null,
): NotificationListResponse {
  return {
    next_cursor: nextCursor,
    previous_cursor: null,
    results: notifications,
  };
}

function makeTripInvitationNotification(
  id: string,
  invitationStatus: TripInvitationStatus,
): Notification {
  return {
    ...makeNotification(id),
    notification_type: "TRIP_INVITATION",
    payload: {
      trip_id: "trip-1",
      trip_name: "Da Nang Getaway",
      destination: "Da Nang",
      start_date: "2026-08-01",
      end_date: "2026-08-05",
      invitation_id: "invitation-1",
      invitation_status: invitationStatus,
    },
  };
}

function NotificationRowsHarness() {
  const { notifications } = useNotifications();

  return (
    <>
      <div data-testid="notification-states">
        {notifications.map((notification) => (
          <span key={notification.id}>
            {notification.id}:{notification.is_read ? "read" : "unread"}|
          </span>
        ))}
      </div>
      <div data-testid="invitation-statuses">
        {notifications
          .filter(
            (notification) =>
              notification.notification_type === "TRIP_INVITATION",
          )
          .map((notification) => (
            <span key={notification.id}>
              {notification.id}:
              {String(notification.payload.invitation_status)}|
            </span>
          ))}
      </div>
    </>
  );
}

function NotificationsHarness() {
  const {
    unreadCount,
    fetchNotifications,
    hasMore,
    isLoading,
    isListLoaded,
    loadMore,
    markAllRead,
    confirmTripInvitationStatus,
  } = useNotifications();
  const [showRows, setShowRows] = useState(true);

  return (
    <div>
      <div data-testid="unread-count">{String(unreadCount)}</div>
      {showRows && <NotificationRowsHarness />}
      <div data-testid="has-more">{String(hasMore)}</div>
      <div data-testid="is-loading">{String(isLoading)}</div>
      <div data-testid="is-list-loaded">{String(isListLoaded)}</div>
      <button type="button" onClick={() => void fetchNotifications()}>
        fetch
      </button>
      <button type="button" onClick={() => void loadMore()}>
        load more
      </button>
      <button type="button" onClick={() => void markAllRead()}>
        mark all
      </button>
      <button
        type="button"
        onClick={() =>
          confirmTripInvitationStatus("n1", "ACCEPTED")
        }
      >
        confirm accepted
      </button>
      <button type="button" onClick={() => setShowRows((current) => !current)}>
        toggle rows
      </button>
    </div>
  );
}

function renderNotifications() {
  return render(
    <NotificationsProvider>
      <NotificationsHarness />
    </NotificationsProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  wsManagerMock.on.mockReturnValue(() => undefined);
  notificationsApiMock.bffMarkRead.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NotificationsProvider", () => {
  it("keeps a confirmed terminal invitation status through row remounts and stale fetches", async () => {
    let notificationHandler: ((data: WsMessage) => void) | undefined;
    wsManagerMock.on.mockImplementation(
      (_event: string, handler: (data: WsMessage) => void) => {
        notificationHandler = handler;
        return () => undefined;
      },
    );
    notificationsApiMock.bffUnreadCount.mockResolvedValue({ unread_count: 1 });
    notificationsApiMock.bffNotificationsList
      .mockResolvedValueOnce(
        makeListResponse([
          makeTripInvitationNotification("n1", "PENDING"),
        ], "cursor-2"),
      )
      .mockResolvedValueOnce(
        makeListResponse([
          makeTripInvitationNotification("n1", "PENDING"),
        ]),
      )
      .mockRejectedValueOnce(new Error("reopen fetch failed"))
      .mockResolvedValueOnce(
        makeListResponse([
          makeTripInvitationNotification("n1", "PENDING"),
        ]),
      );

    renderNotifications();

    await waitFor(() => {
      expect(screen.getByTestId("unread-count").textContent).toBe("1");
    });

    fireEvent.click(screen.getByRole("button", { name: "fetch" }));

    await waitFor(() => {
      expect(screen.getByTestId("invitation-statuses").textContent).toBe(
        "n1:PENDING|",
      );
      expect(screen.getByTestId("has-more").textContent).toBe("true");
    });

    fireEvent.click(
      screen.getByRole("button", { name: "confirm accepted" }),
    );

    expect(screen.getByTestId("invitation-statuses").textContent).toBe(
      "n1:ACCEPTED|",
    );

    fireEvent.click(screen.getByRole("button", { name: "toggle rows" }));
    expect(screen.queryByTestId("invitation-statuses")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "toggle rows" }));
    expect(screen.getByTestId("invitation-statuses").textContent).toBe(
      "n1:ACCEPTED|",
    );

    fireEvent.click(screen.getByRole("button", { name: "load more" }));

    await waitFor(() => {
      expect(notificationsApiMock.bffNotificationsList).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("is-loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("invitation-statuses").textContent).toBe(
      "n1:ACCEPTED|",
    );

    fireEvent.click(screen.getByRole("button", { name: "fetch" }));

    await waitFor(() => {
      expect(notificationsApiMock.bffNotificationsList).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId("is-loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("invitation-statuses").textContent).toBe(
      "n1:ACCEPTED|",
    );

    fireEvent.click(screen.getByRole("button", { name: "fetch" }));

    await waitFor(() => {
      expect(notificationsApiMock.bffNotificationsList).toHaveBeenCalledTimes(4);
      expect(screen.getByTestId("is-loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("invitation-statuses").textContent).toBe(
      "n1:ACCEPTED|",
    );

    notificationHandler?.({
      type: "notification",
      event: "created",
      notification: makeTripInvitationNotification("n1", "PENDING"),
    });

    await waitFor(() => {
      expect(screen.getByTestId("invitation-statuses").textContent).toBe(
        "n1:ACCEPTED|",
      );
    });
  });

  it("does not let snapshot reconcile get consumed by the count-only effect", async () => {
    notificationsApiMock.bffUnreadCount
      .mockResolvedValueOnce({ unread_count: 2 })
      .mockRejectedValueOnce(new Error("fallback count failed"));
    notificationsApiMock.bffNotificationsList
      .mockResolvedValueOnce(makeListResponse([makeNotification("n1")]))
      .mockRejectedValueOnce(new Error("fallback list failed"));
    notificationsApiMock.bffMarkAllRead.mockRejectedValueOnce(
      new Error("mark all failed"),
    );

    renderNotifications();

    await waitFor(() => {
      expect(screen.getByTestId("unread-count").textContent).toBe("2");
    });

    fireEvent.click(screen.getByRole("button", { name: "fetch" }));

    await waitFor(() => {
      expect(screen.getByTestId("notification-states").textContent).toBe(
        "n1:unread|",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "mark all" }));

    await waitFor(() => {
      expect(screen.getByTestId("notification-states").textContent).toBe(
        "n1:read|",
      );
    });

    await waitFor(() => {
      expect(notificationsApiMock.bffMarkAllRead).toHaveBeenCalledTimes(1);
      expect(notificationsApiMock.bffUnreadCount).toHaveBeenCalledTimes(2);
      expect(notificationsApiMock.bffNotificationsList).toHaveBeenCalledTimes(2);
    });
  });

  it("replaces stale cached pages with an authoritative snapshot on reopen", async () => {
    notificationsApiMock.bffUnreadCount
      .mockResolvedValueOnce({ unread_count: 2 })
      .mockRejectedValueOnce(new Error("fallback count failed"))
      .mockResolvedValueOnce({ unread_count: 1 });
    notificationsApiMock.bffNotificationsList
      .mockResolvedValueOnce(
        makeListResponse([makeNotification("n1")], "cursor-2"),
      )
      .mockResolvedValueOnce(makeListResponse([makeNotification("n2")]))
      .mockRejectedValueOnce(new Error("fallback list failed"))
      .mockResolvedValueOnce(makeListResponse([makeNotification("n1")]));
    notificationsApiMock.bffMarkAllRead.mockRejectedValueOnce(
      new Error("mark all failed"),
    );

    renderNotifications();

    await waitFor(() => {
      expect(screen.getByTestId("unread-count").textContent).toBe("2");
    });

    fireEvent.click(screen.getByRole("button", { name: "fetch" }));

    await waitFor(() => {
      expect(screen.getByTestId("notification-states").textContent).toBe(
        "n1:unread|",
      );
      expect(screen.getByTestId("has-more").textContent).toBe("true");
    });

    fireEvent.click(screen.getByRole("button", { name: "load more" }));

    await waitFor(() => {
      expect(screen.getByTestId("notification-states").textContent).toBe(
        "n1:unread|n2:unread|",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "mark all" }));

    await waitFor(() => {
      expect(screen.getByTestId("notification-states").textContent).toBe(
        "n1:read|n2:read|",
      );
    });

    // Wait for mark-all fallback to complete before next action
    await waitFor(() => {
      expect(notificationsApiMock.bffUnreadCount).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "fetch" }));

    await waitFor(() => {
      expect(screen.getByTestId("unread-count").textContent).toBe("1");
      expect(screen.getByTestId("notification-states").textContent).toBe(
        "n1:unread|",
      );
      expect(screen.getByTestId("has-more").textContent).toBe("false");
    });
  });

  it("uses the authoritative snapshot immediately when mark-all fallback succeeds", async () => {
    notificationsApiMock.bffUnreadCount
      .mockResolvedValueOnce({ unread_count: 2 })
      .mockResolvedValueOnce({ unread_count: 1 });
    notificationsApiMock.bffNotificationsList
      .mockResolvedValueOnce(
        makeListResponse([makeNotification("n1")], "cursor-2"),
      )
      .mockResolvedValueOnce(makeListResponse([makeNotification("n2")]))
      .mockResolvedValueOnce(makeListResponse([makeNotification("n1")]));
    notificationsApiMock.bffMarkAllRead.mockRejectedValueOnce(
      new Error("mark all failed"),
    );

    renderNotifications();

    await waitFor(() => {
      expect(screen.getByTestId("unread-count").textContent).toBe("2");
    });

    fireEvent.click(screen.getByRole("button", { name: "fetch" }));

    await waitFor(() => {
      expect(screen.getByTestId("notification-states").textContent).toBe("n1:unread|");
      expect(screen.getByTestId("has-more").textContent).toBe("true");
    });

    fireEvent.click(screen.getByRole("button", { name: "load more" }));

    await waitFor(() => {
      expect(screen.getByTestId("notification-states").textContent).toBe(
        "n1:unread|n2:unread|",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "mark all" }));

    await waitFor(() => {
      expect(screen.getByTestId("unread-count").textContent).toBe("1");
      expect(screen.getByTestId("notification-states").textContent).toBe(
        "n1:unread|",
      );
      expect(screen.getByTestId("has-more").textContent).toBe("false");
    });
  });

  it("keeps snapshot reconcile pending after a failed reopen fetch", async () => {
    notificationsApiMock.bffUnreadCount
      .mockResolvedValueOnce({ unread_count: 2 })
      .mockRejectedValueOnce(new Error("fallback count failed"))
      .mockRejectedValueOnce(new Error("reopen count failed"))
      .mockResolvedValueOnce({ unread_count: 1 });
    notificationsApiMock.bffNotificationsList
      .mockResolvedValueOnce(makeListResponse([makeNotification("n1")]))
      .mockRejectedValueOnce(new Error("fallback list failed"))
      .mockRejectedValueOnce(new Error("reopen list failed"))
      .mockResolvedValueOnce(makeListResponse([makeNotification("n1")]));
    notificationsApiMock.bffMarkAllRead.mockRejectedValueOnce(
      new Error("mark all failed"),
    );

    renderNotifications();

    await waitFor(() => {
      expect(screen.getByTestId("unread-count").textContent).toBe("2");
    });

    fireEvent.click(screen.getByRole("button", { name: "fetch" }));

    await waitFor(() => {
      expect(screen.getByTestId("notification-states").textContent).toBe(
        "n1:unread|",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "mark all" }));

    await waitFor(() => {
      expect(screen.getByTestId("notification-states").textContent).toBe(
        "n1:read|",
      );
    });

    // Wait for mark-all fallback to complete before next action
    await waitFor(() => {
      expect(notificationsApiMock.bffUnreadCount).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "fetch" }));

    await waitFor(() => {
      expect(notificationsApiMock.bffUnreadCount).toHaveBeenCalledTimes(3);
      expect(notificationsApiMock.bffNotificationsList).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId("unread-count").textContent).toBe("0");
      expect(screen.getByTestId("is-loading").textContent).toBe("false");
      expect(screen.getByTestId("notification-states").textContent).toBe(
        "n1:read|",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "fetch" }));

    await waitFor(() => {
      expect(screen.getByTestId("unread-count").textContent).toBe("1");
      expect(screen.getByTestId("notification-states").textContent).toBe(
        "n1:unread|",
      );
    });
  });
});
