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
  WsNotificationMessage,
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

type NotificationsState = {
  unreadCount: number;
  unreadCountHydrated: boolean;
  needsUnreadReconcile: boolean;
  notifications: Notification[];
  hasMore: boolean;
  cursor: string | null;
  isListLoaded: boolean;
  isLoading: boolean;
  /** IDs optimistically marked read by THIS tab — used to avoid double-decrement
   *  when the WS echo arrives back for our own mark-read action. */
  optimisticReadIds: string[];
};

const initialState: NotificationsState = {
  unreadCount: 0,
  unreadCountHydrated: false,
  needsUnreadReconcile: false,
  notifications: [],
  hasMore: false,
  cursor: null,
  isListLoaded: false,
  isLoading: false,
  optimisticReadIds: [],
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
  | { type: "MARK_ALL_READ_FAILED"; count: number; notifications: Notification[]; nextCursor: string | null };

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

// -------- Reducer --------

function reducer(state: NotificationsState, action: Action): NotificationsState {
  switch (action.type) {
    case "SET_UNREAD_COUNT":
      return {
        ...state,
        unreadCount: action.count,
        unreadCountHydrated: true,
        needsUnreadReconcile: state.needsUnreadReconcile,
      };

    case "SET_LOADING":
      return { ...state, isLoading: action.loading };

    case "NOTIFICATIONS_LOADED":
      return {
        ...state,
        notifications: upsertMany(state.notifications, action.notifications),
        hasMore: action.nextCursor !== null,
        cursor: action.nextCursor,
        isListLoaded: true,
        isLoading: false,
      };

    case "MORE_LOADED":
      return {
        ...state,
        notifications: upsertMany(state.notifications, action.notifications),
        hasMore: action.nextCursor !== null,
        cursor: action.nextCursor,
        isLoading: false,
      };

    case "NOTIFICATION_RECEIVED": {
      const exists = state.notifications.some((n) => n.id === action.notification.id);
      const notifications = upsertNotification(state.notifications, action.notification);

      if (!state.unreadCountHydrated) {
        return {
          ...state,
          notifications,
          needsUnreadReconcile: true,
        };
      }

      return {
        ...state,
        notifications,
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
        return { ...state, notifications, optimisticReadIds, needsUnreadReconcile: true };
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
        return { ...state, notifications, needsUnreadReconcile: true };
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

    case "MARK_ALL_READ_FAILED":
      return {
        ...state,
        unreadCount: action.count,
        notifications: upsertMany([], action.notifications),
        hasMore: action.nextCursor !== null,
        cursor: action.nextCursor,
        isListLoaded: true,
      };
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
    if (!state.unreadCountHydrated || !state.needsUnreadReconcile) return;

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
  }, [state.unreadCountHydrated, state.needsUnreadReconcile]);

  // Subscribe to WS notifications
  useEffect(() => {
    return wsManager.on("notification", (data: WsMessage) => {
      const msg = data as unknown as WsNotificationMessage;

      switch (msg.event) {
        case "created":
          dispatch({ type: "NOTIFICATION_RECEIVED", notification: msg.notification });
          break;
        case "read":
          dispatch({ type: "NOTIFICATION_READ_SYNC", notificationIds: msg.notification_ids });
          break;
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
      const data = await bffNotificationsList();
      dispatch({
        type: "NOTIFICATIONS_LOADED",
        notifications: data.results,
        nextCursor: data.next_cursor,
      });
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
          type: "MARK_ALL_READ_FAILED",
          count: countData.unread_count,
          notifications: listData.results,
          nextCursor: listData.next_cursor,
        });
      } catch {
        // Double failure — user can refresh manually
      }
    }
  }, []);

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
    }),
    [state, fetchNotifications, loadMore, markRead, markAllRead],
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
