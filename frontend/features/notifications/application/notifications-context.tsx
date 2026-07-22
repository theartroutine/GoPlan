"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import type {
  Notification,
  TripInvitationStatus,
} from "@/features/notifications/domain/types";
import {
  bffMarkAllRead,
  bffMarkRead,
  bffNotificationsList,
  bffUnreadCount,
} from "@/features/notifications/infrastructure/notifications-api";
import { wsManager } from "@/features/realtime/infrastructure/ws-manager";
import type { WsMessage } from "@/features/realtime/domain/types";

// -------- State --------

type TerminalTripInvitationStatus = Exclude<
  TripInvitationStatus,
  "PENDING"
>;

type NotificationsState = {
  unreadCount: number;
  unreadCountHydrated: boolean;
  pendingReconcile: "none" | "count_only" | "snapshot_on_open";
  notifications: Notification[];
  hasMore: boolean;
  cursor: string | null;
  isListLoaded: boolean;
  isLoading: boolean;
  /** IDs optimistically marked read by THIS tab — used to avoid double-decrement
   *  when the WS echo arrives back for our own mark-read action. */
  optimisticReadIds: string[];
  /** Terminal invitation states observed or confirmed during this provider
   *  lifetime. They prevent an older PENDING REST/WS snapshot from restoring
   *  invitation actions after the server has accepted a mutation. */
  confirmedInvitationStatuses: Partial<
    Record<string, TerminalTripInvitationStatus>
  >;
};

const initialState: NotificationsState = {
  unreadCount: 0,
  unreadCountHydrated: false,
  pendingReconcile: "none",
  notifications: [],
  hasMore: false,
  cursor: null,
  isListLoaded: false,
  isLoading: false,
  optimisticReadIds: [],
  confirmedInvitationStatuses: {},
};

// -------- Actions --------

type Action =
  | { type: "SET_UNREAD_COUNT"; count: number }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "NOTIFICATIONS_LOADED"; notifications: Notification[]; nextCursor: string | null }
  | { type: "MORE_LOADED"; notifications: Notification[]; nextCursor: string | null }
  | { type: "NOTIFICATION_RECEIVED"; notification: Notification }
  | { type: "NOTIFICATION_READ_SYNC"; notificationIds: string[] }
  | { type: "NOTIFICATION_READ_ALL_SYNC" }
  | { type: "MARK_READ"; notificationId: string }
  | { type: "MARK_ALL_READ" }
  | { type: "MARK_READ_ROLLBACK"; notificationId: string }
  | { type: "MARK_ALL_READ_RECONCILE" }
  | { type: "RECONCILE_APPLIED"; count: number; notifications: Notification[]; nextCursor: string | null }
  | {
      type: "CONFIRM_INVITATION_STATUS";
      notificationId: string;
      status: TerminalTripInvitationStatus;
    };

// -------- Helpers --------

function upsertNotification(
  list: Notification[],
  incoming: Notification,
): Notification[] {
  const idx = list.findIndex((n) => n.id === incoming.id);
  if (idx >= 0) {
    const updated = [...list];
    updated[idx] = incoming;
    return updated;
  }
  // Insert in correct position (newest first)
  const insertIdx = list.findIndex(
    (n) => new Date(n.created_at) < new Date(incoming.created_at),
  );
  if (insertIdx === -1) return [...list, incoming];
  const result = [...list];
  result.splice(insertIdx, 0, incoming);
  return result;
}

function upsertMany(
  list: Notification[],
  incoming: Notification[],
): Notification[] {
  let result = list;
  for (const n of incoming) {
    result = upsertNotification(result, n);
  }
  return result;
}

function getInvitationStatus(
  notification: Notification,
): TripInvitationStatus | null {
  if (notification.notification_type !== "TRIP_INVITATION") return null;

  const payload: unknown = notification.payload;
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }

  const status = (payload as Record<string, unknown>).invitation_status;
  return status === "PENDING" ||
    status === "ACCEPTED" ||
    status === "DECLINED" ||
    status === "CANCELLED"
    ? status
    : null;
}

function getTerminalInvitationStatus(
  notification: Notification,
): TerminalTripInvitationStatus | null {
  const status = getInvitationStatus(notification);
  return status && status !== "PENDING" ? status : null;
}

function collectConfirmedInvitationStatuses(
  current: NotificationsState["confirmedInvitationStatuses"],
  notifications: Notification[],
): NotificationsState["confirmedInvitationStatuses"] {
  let result = current;

  for (const notification of notifications) {
    const status = getTerminalInvitationStatus(notification);
    if (!status || result[notification.id]) continue;

    if (result === current) result = { ...current };
    result[notification.id] = status;
  }

  return result;
}

function applyConfirmedInvitationStatus(
  notification: Notification,
  confirmedStatuses: NotificationsState["confirmedInvitationStatuses"],
): Notification {
  if (notification.notification_type !== "TRIP_INVITATION") {
    return notification;
  }

  const confirmedStatus = confirmedStatuses[notification.id];
  const incomingStatus = getInvitationStatus(notification);

  if (!confirmedStatus || !incomingStatus || incomingStatus === confirmedStatus) {
    return notification;
  }

  return {
    ...notification,
    payload: {
      ...notification.payload,
      invitation_status: confirmedStatus,
    },
  };
}

function reconcileIncomingNotifications(
  currentStatuses: NotificationsState["confirmedInvitationStatuses"],
  notifications: Notification[],
) {
  const confirmedInvitationStatuses = collectConfirmedInvitationStatuses(
    currentStatuses,
    notifications,
  );
  return {
    confirmedInvitationStatuses,
    notifications: notifications.map((notification) =>
      applyConfirmedInvitationStatus(
        notification,
        confirmedInvitationStatuses,
      ),
    ),
  };
}

function mergePendingReconcile(
  current: NotificationsState["pendingReconcile"],
  requested: NotificationsState["pendingReconcile"],
): NotificationsState["pendingReconcile"] {
  if (current === "snapshot_on_open" || requested === "none") {
    return current;
  }
  return requested;
}

// -------- Reducer --------

function reducer(state: NotificationsState, action: Action): NotificationsState {
  switch (action.type) {
    case "SET_UNREAD_COUNT":
      return {
        ...state,
        unreadCount: action.count,
        unreadCountHydrated: true,
        pendingReconcile:
          state.pendingReconcile === "count_only" ? "none" : state.pendingReconcile,
      };

    case "SET_LOADING":
      return { ...state, isLoading: action.loading };

    case "NOTIFICATIONS_LOADED": {
      const reconciled = reconcileIncomingNotifications(
        state.confirmedInvitationStatuses,
        action.notifications,
      );
      return {
        ...state,
        notifications: upsertMany(
          state.notifications,
          reconciled.notifications,
        ),
        confirmedInvitationStatuses:
          reconciled.confirmedInvitationStatuses,
        hasMore: action.nextCursor !== null,
        cursor: action.nextCursor,
        isListLoaded: true,
        isLoading: false,
      };
    }

    case "MORE_LOADED": {
      const reconciled = reconcileIncomingNotifications(
        state.confirmedInvitationStatuses,
        action.notifications,
      );
      return {
        ...state,
        notifications: upsertMany(
          state.notifications,
          reconciled.notifications,
        ),
        confirmedInvitationStatuses:
          reconciled.confirmedInvitationStatuses,
        hasMore: action.nextCursor !== null,
        cursor: action.nextCursor,
        isLoading: false,
      };
    }

    case "NOTIFICATION_RECEIVED": {
      const reconciled = reconcileIncomingNotifications(
        state.confirmedInvitationStatuses,
        [action.notification],
      );
      const incomingNotification = reconciled.notifications[0];
      const exists = state.notifications.some(
        (notification) => notification.id === incomingNotification.id,
      );
      const notifications = upsertNotification(
        state.notifications,
        incomingNotification,
      );

      if (!state.unreadCountHydrated) {
        return {
          ...state,
          notifications,
          confirmedInvitationStatuses:
            reconciled.confirmedInvitationStatuses,
          pendingReconcile: mergePendingReconcile(
            state.pendingReconcile,
            "count_only",
          ),
        };
      }

      return {
        ...state,
        notifications,
        confirmedInvitationStatuses:
          reconciled.confirmedInvitationStatuses,
        unreadCount: exists ? state.unreadCount : state.unreadCount + 1,
      };
    }

    case "NOTIFICATION_READ_SYNC": {
      const ids = new Set(action.notificationIds);

      // Update local list items if present
      const notifications = state.notifications.map((n) => {
        if (ids.has(n.id) && !n.is_read) {
          return { ...n, is_read: true };
        }
        return n;
      });

      // Separate IDs into "ours" (optimistic, already decremented) vs "theirs" (from other tabs/devices)
      const remainingOptimistic: string[] = [];
      let externalReadCount = 0;
      for (const id of action.notificationIds) {
        if (state.optimisticReadIds.includes(id)) {
          // This is the WS echo for our own optimistic mark-read — don't decrement again
          // Remove from optimistic set (consumed)
          remainingOptimistic.push(id);
        } else {
          // From another tab/device — always decrement, even if item isn't in local list
          externalReadCount += 1;
        }
      }

      const optimisticReadIds = state.optimisticReadIds.filter(
        (id) => !remainingOptimistic.includes(id),
      );

      if (!state.unreadCountHydrated) {
        return {
          ...state,
          notifications,
          optimisticReadIds,
          pendingReconcile: mergePendingReconcile(
            state.pendingReconcile,
            "count_only",
          ),
        };
      }

      return {
        ...state,
        notifications,
        optimisticReadIds,
        unreadCount: Math.max(0, state.unreadCount - externalReadCount),
      };
    }

    case "NOTIFICATION_READ_ALL_SYNC": {
      const notifications = state.notifications.map((n) =>
        n.is_read ? n : { ...n, is_read: true },
      );

      if (!state.unreadCountHydrated) {
        return {
          ...state,
          notifications,
          pendingReconcile: mergePendingReconcile(
            state.pendingReconcile,
            "count_only",
          ),
        };
      }

      return { ...state, notifications, unreadCount: 0 };
    }

    case "MARK_READ": {
      const notification = state.notifications.find((n) => n.id === action.notificationId);
      if (!notification || notification.is_read) return state;

      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.notificationId ? { ...n, is_read: true } : n,
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
        optimisticReadIds: [...state.optimisticReadIds, action.notificationId],
      };
    }

    case "MARK_ALL_READ":
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.is_read ? n : { ...n, is_read: true },
        ),
        unreadCount: 0,
        optimisticReadIds: [],
      };

    case "MARK_READ_ROLLBACK": {
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.notificationId ? { ...n, is_read: false } : n,
        ),
        unreadCount: state.unreadCount + 1,
        optimisticReadIds: state.optimisticReadIds.filter((id) => id !== action.notificationId),
      };
    }

    case "MARK_ALL_READ_RECONCILE":
      return {
        ...state,
        pendingReconcile: "snapshot_on_open",
      };

    case "RECONCILE_APPLIED": {
      const reconciled = reconcileIncomingNotifications(
        state.confirmedInvitationStatuses,
        action.notifications,
      );
      return {
        ...state,
        unreadCount: action.count,
        unreadCountHydrated: true,
        pendingReconcile: "none",
        notifications: reconciled.notifications,
        confirmedInvitationStatuses:
          reconciled.confirmedInvitationStatuses,
        hasMore: action.nextCursor !== null,
        cursor: action.nextCursor,
        isListLoaded: true,
        isLoading: false,
        optimisticReadIds: [],
      };
    }

    case "CONFIRM_INVITATION_STATUS": {
      const status =
        state.confirmedInvitationStatuses[action.notificationId] ??
        action.status;
      const confirmedInvitationStatuses = {
        ...state.confirmedInvitationStatuses,
        [action.notificationId]: status,
      };

      return {
        ...state,
        confirmedInvitationStatuses,
        notifications: state.notifications.map((notification) =>
          applyConfirmedInvitationStatus(
            notification,
            confirmedInvitationStatuses,
          ),
        ),
      };
    }
  }
}

// -------- Context --------

type NotificationsContextValue = {
  unreadCount: number;
  notifications: Notification[];
  isLoading: boolean;
  hasMore: boolean;
  isListLoaded: boolean;
  fetchNotifications: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  confirmTripInvitationStatus: (
    notificationId: string,
    status: TerminalTripInvitationStatus,
  ) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  });

  // Fetch unread count on mount — retry with backoff on failure
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;
    const MAX_RETRIES = 3;

    async function hydrate(attempt = 0) {
      try {
        const data = await bffUnreadCount();
        if (cancelled) return;
        dispatch({ type: "SET_UNREAD_COUNT", count: data.unread_count });
      } catch {
        if (cancelled || attempt >= MAX_RETRIES) return;
        const delay = Math.min(2000 * 2 ** attempt, 10_000);
        retryTimer = setTimeout(() => {
          if (!cancelled) void hydrate(attempt + 1);
        }, delay);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, []);

  // Reconcile if WS events arrived before hydration
  useEffect(() => {
    if (!state.unreadCountHydrated || state.pendingReconcile !== "count_only") return;

    let cancelled = false;

    async function reconcile() {
      try {
        const data = await bffUnreadCount();
        if (cancelled) return;
        dispatch({ type: "SET_UNREAD_COUNT", count: data.unread_count });
      } catch {
        // Best-effort
      }
    }

    void reconcile();
    return () => { cancelled = true; };
  }, [state.unreadCountHydrated, state.pendingReconcile]);

  // Subscribe to WS notifications
  useEffect(() => {
    return wsManager.on("notification", (data: WsMessage) => {
      const event = data.event as string | undefined;
      if (!event) return;

      switch (event) {
        case "created": {
          const notification = data.notification;
          if (!notification || typeof notification !== "object") return;
          dispatch({
            type: "NOTIFICATION_RECEIVED",
            notification: notification as Notification,
          });
          break;
        }
        case "read": {
          const ids = data.notification_ids;
          if (!Array.isArray(ids)) return;
          dispatch({
            type: "NOTIFICATION_READ_SYNC",
            notificationIds: ids as string[],
          });
          break;
        }
        case "read_all":
          dispatch({ type: "NOTIFICATION_READ_ALL_SYNC" });
          break;
      }
    });
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (stateRef.current.isLoading) return;
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      if (stateRef.current.pendingReconcile === "snapshot_on_open") {
        const [countData, listData] = await Promise.all([
          bffUnreadCount(),
          bffNotificationsList(),
        ]);
        dispatch({
          type: "RECONCILE_APPLIED",
          count: countData.unread_count,
          notifications: listData.results,
          nextCursor: listData.next_cursor,
        });
      } else {
        const data = await bffNotificationsList();
        dispatch({
          type: "NOTIFICATIONS_LOADED",
          notifications: data.results,
          nextCursor: data.next_cursor,
        });
      }
    } catch {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, []);

  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (current.isLoading || !current.hasMore || !current.cursor) return;
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const data = await bffNotificationsList(current.cursor);
      dispatch({
        type: "MORE_LOADED",
        notifications: data.results,
        nextCursor: data.next_cursor,
      });
    } catch {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    dispatch({ type: "MARK_READ", notificationId: id });
    try {
      await bffMarkRead(id);
    } catch {
      dispatch({ type: "MARK_READ_ROLLBACK", notificationId: id });
    }
  }, []);

  const markAllRead = useCallback(async () => {
    dispatch({ type: "MARK_ALL_READ" });
    try {
      await bffMarkAllRead();
    } catch {
      // Refetch to get accurate state
      try {
        const [countData, listData] = await Promise.all([
          bffUnreadCount(),
          bffNotificationsList(),
        ]);
        dispatch({
          type: "RECONCILE_APPLIED",
          count: countData.unread_count,
          notifications: listData.results,
          nextCursor: listData.next_cursor,
        });
      } catch {
        // Double failure — flag for reconcile on next opportunity
        dispatch({ type: "MARK_ALL_READ_RECONCILE" });
      }
    }
  }, []);

  const confirmTripInvitationStatus = useCallback(
    (
      notificationId: string,
      status: TerminalTripInvitationStatus,
    ) => {
      dispatch({
        type: "CONFIRM_INVITATION_STATUS",
        notificationId,
        status,
      });
    },
    [],
  );

  const value = useMemo(
    () => ({
      unreadCount: state.unreadCount,
      notifications: state.notifications,
      isLoading: state.isLoading,
      hasMore: state.hasMore,
      isListLoaded: state.isListLoaded,
      fetchNotifications,
      loadMore,
      markRead,
      markAllRead,
      confirmTripInvitationStatus,
    }),
    [state.unreadCount, state.notifications, state.isLoading, state.hasMore, state.isListLoaded, fetchNotifications, loadMore, markRead, markAllRead, confirmTripInvitationStatus],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return ctx;
}
