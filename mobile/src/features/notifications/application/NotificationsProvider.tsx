import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { normalizeApiError, type ApiError } from '@/shared/api/errors';
import { publishTripEvent } from '@/features/trips/tripEvents';
import {
  acceptTripInvitation,
  declineTripInvitation,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api';
import type {
  InvitationAction,
  InvitationStatus,
  NotificationErrorSource,
  NotificationItem,
  NotificationLoadMode,
  NotificationOverride,
  NotificationListStatus,
  NotificationsContextValue,
} from '../types';

interface NotificationsProviderProps extends PropsWithChildren {
  ownerUserId: string | null;
}

interface ReadAllOverride {
  version: number;
}

interface OwnerGeneration {
  ownerUserId: string;
  generation: number;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function applyOverride(item: NotificationItem, override: NotificationOverride | undefined): NotificationItem {
  if (!override) {
    return item;
  }
  let next = override.isRead === undefined ? item : { ...item, is_read: override.isRead };
  if (override.invitationStatus !== undefined && item.notification_type === 'TRIP_INVITATION') {
    const payload = isRecord(item.payload) ? item.payload : {};
    next = {
      ...next,
      payload: { ...payload, invitation_status: override.invitationStatus },
    };
  }
  return next;
}

function applyResponseOverrides(
  items: NotificationItem[],
  overrides: Map<string, NotificationOverride>,
  readAllOverride: ReadAllOverride | null,
  requestMutationVersion: number,
): NotificationItem[] {
  return items.map((item) => {
    const override = overrides.get(item.id);
    let next = applyOverride(
      item,
      override && override.version > requestMutationVersion ? override : undefined,
    );
    if (readAllOverride && readAllOverride.version > requestMutationVersion && !next.is_read) {
      next = { ...next, is_read: true };
    }
    return next;
  });
}

function OwnedNotificationsProvider({ children, ownerUserId }: NotificationsProviderProps) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [status, setStatus] = useState<NotificationListStatus>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const [errorSource, setErrorSource] = useState<NotificationErrorSource>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [pendingReadIds, setPendingReadIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingInvitationActions, setPendingInvitationActions] = useState<ReadonlyMap<string, InvitationAction>>(
    new Map(),
  );
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<string, ApiError>>(new Map());
  const [globalMutationError, setGlobalMutationError] = useState<ApiError | null>(null);

  const itemsRef = useRef<NotificationItem[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const firstPageRequestRef = useRef(0);
  const firstPageInFlightRef = useRef<number | null>(null);
  const listGenerationRef = useRef(0);
  const loadMoreInFlightRef = useRef(false);
  const hasUsablePageRef = useRef(false);
  const hasRequestedListRef = useRef(false);
  const overridesRef = useRef(new Map<string, NotificationOverride>());
  const readAllOverrideRef = useRef<ReadAllOverride | null>(null);
  const mutationVersionRef = useRef(0);
  const countRequestRef = useRef(0);
  const readLocksRef = useRef(new Set<string>());
  const markAllLockRef = useRef(false);
  const invitationLocksRef = useRef(new Map<string, InvitationAction>());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const providerActiveRef = useRef(true);
  const activeOwnerUserIdRef = useRef(ownerUserId);
  const ownerGenerationRef = useRef(1);

  const captureOwnerGeneration = useCallback((): OwnerGeneration | null => {
    if (
      !ownerUserId ||
      !providerActiveRef.current ||
      activeOwnerUserIdRef.current !== ownerUserId
    ) {
      return null;
    }
    return { ownerUserId, generation: ownerGenerationRef.current };
  }, [ownerUserId]);

  const isOwnerGenerationCurrent = useCallback(
    (ownerGeneration: OwnerGeneration | null): ownerGeneration is OwnerGeneration => {
      return Boolean(
        ownerGeneration &&
          providerActiveRef.current &&
          activeOwnerUserIdRef.current === ownerGeneration.ownerUserId &&
          ownerGenerationRef.current === ownerGeneration.generation,
      );
    },
    [],
  );

  useLayoutEffect(() => {
    providerActiveRef.current = true;
    activeOwnerUserIdRef.current = ownerUserId;
    const readLocks = readLocksRef.current;
    const invitationLocks = invitationLocksRef.current;
    return () => {
      providerActiveRef.current = false;
      ownerGenerationRef.current += 1;
      firstPageRequestRef.current += 1;
      listGenerationRef.current += 1;
      countRequestRef.current += 1;
      firstPageInFlightRef.current = null;
      loadMoreInFlightRef.current = false;
      readLocks.clear();
      markAllLockRef.current = false;
      invitationLocks.clear();
    };
  }, [ownerUserId]);

  const replaceItems = useCallback(
    (next: NotificationItem[], ownerGeneration: OwnerGeneration) => {
      if (!isOwnerGenerationCurrent(ownerGeneration)) {
        return;
      }
      itemsRef.current = next;
      setItems(next);
    },
    [isOwnerGenerationCurrent],
  );

  const updateItems = useCallback(
    (
      update: (current: NotificationItem[]) => NotificationItem[],
      ownerGeneration: OwnerGeneration,
    ) => {
      if (!isOwnerGenerationCurrent(ownerGeneration)) {
        return;
      }
      setItems((current) => {
        const next = update(current);
        itemsRef.current = next;
        return next;
      });
    },
    [isOwnerGenerationCurrent],
  );

  const clearRowError = useCallback(
    (notificationId: string, ownerGeneration: OwnerGeneration) => {
      if (!isOwnerGenerationCurrent(ownerGeneration)) {
        return;
      }
      setRowErrors((current) => {
        if (!current.has(notificationId)) {
          return current;
        }
        const next = new Map(current);
        next.delete(notificationId);
        return next;
      });
    },
    [isOwnerGenerationCurrent],
  );

  const setRowError = useCallback(
    (notificationId: string, nextError: ApiError, ownerGeneration: OwnerGeneration) => {
      if (!isOwnerGenerationCurrent(ownerGeneration)) {
        return;
      }
      setRowErrors((current) => new Map(current).set(notificationId, nextError));
    },
    [isOwnerGenerationCurrent],
  );

  const applyLocalOverride = useCallback(
    (
      notificationId: string,
      patch: Omit<NotificationOverride, 'version'>,
      ownerGeneration: OwnerGeneration,
    ) => {
      if (!isOwnerGenerationCurrent(ownerGeneration)) {
        return;
      }
      mutationVersionRef.current += 1;
      const current = overridesRef.current.get(notificationId);
      const override: NotificationOverride = {
        ...current,
        ...patch,
        version: mutationVersionRef.current,
      };
      overridesRef.current.set(notificationId, override);
      updateItems(
        (visibleItems) =>
          visibleItems.map((item) =>
            item.id === notificationId ? applyOverride(item, override) : item,
          ),
        ownerGeneration,
      );
    },
    [isOwnerGenerationCurrent, updateItems],
  );

  const reconcileUnreadCount = useCallback(
    async (expectedOwnerGeneration?: OwnerGeneration) => {
      const ownerGeneration = expectedOwnerGeneration ?? captureOwnerGeneration();
      if (!isOwnerGenerationCurrent(ownerGeneration)) {
        return;
      }
      const requestId = countRequestRef.current + 1;
      countRequestRef.current = requestId;
      const requestMutationVersion = mutationVersionRef.current;
      try {
        const count = await getUnreadCount();
        if (
          isOwnerGenerationCurrent(ownerGeneration) &&
          requestId === countRequestRef.current &&
          requestMutationVersion === mutationVersionRef.current
        ) {
          setUnreadCount(count);
        }
      } catch {
        // Keep the last usable badge. Focus and foreground transitions retry.
      }
    },
    [captureOwnerGeneration, isOwnerGenerationCurrent],
  );

  const loadFirstPage = useCallback(
    async (mode: NotificationLoadMode, expectedOwnerGeneration?: OwnerGeneration) => {
      const ownerGeneration = expectedOwnerGeneration ?? captureOwnerGeneration();
      if (!isOwnerGenerationCurrent(ownerGeneration)) {
        return;
      }
      hasRequestedListRef.current = true;
      const requestId = firstPageRequestRef.current + 1;
      firstPageRequestRef.current = requestId;
      firstPageInFlightRef.current = requestId;
      listGenerationRef.current += 1;
      const requestMutationVersion = mutationVersionRef.current;
      loadMoreInFlightRef.current = false;
      setLoadingMore(false);
      setError(null);
      setErrorSource(null);
      if (mode === 'initial') {
        setStatus('loading');
      } else if (mode === 'refresh') {
        setRefreshing(true);
      }

      try {
        const page = await listNotifications();
        if (
          !isOwnerGenerationCurrent(ownerGeneration) ||
          requestId !== firstPageRequestRef.current
        ) {
          return;
        }
        nextCursorRef.current = page.nextCursor;
        setHasNextPage(page.nextCursor !== null);
        replaceItems(
          applyResponseOverrides(
            page.items,
            overridesRef.current,
            readAllOverrideRef.current,
            requestMutationVersion,
          ),
          ownerGeneration,
        );
        hasUsablePageRef.current = true;
        setStatus('ready');
      } catch (caught) {
        if (
          !isOwnerGenerationCurrent(ownerGeneration) ||
          requestId !== firstPageRequestRef.current
        ) {
          return;
        }
        setError(normalizeApiError(caught));
        if (mode === 'initial' || !hasUsablePageRef.current) {
          setErrorSource('initial');
          setStatus('error');
        } else {
          setErrorSource('refresh');
          setStatus('ready');
        }
      } finally {
        if (requestId === firstPageRequestRef.current) {
          firstPageInFlightRef.current = null;
          if (isOwnerGenerationCurrent(ownerGeneration)) {
            setRefreshing(false);
          }
        }
      }
    },
    [captureOwnerGeneration, isOwnerGenerationCurrent, replaceItems],
  );

  const loadMore = useCallback(async () => {
    const ownerGeneration = captureOwnerGeneration();
    const cursor = nextCursorRef.current;
    if (
      !isOwnerGenerationCurrent(ownerGeneration) ||
      firstPageInFlightRef.current !== null ||
      loadMoreInFlightRef.current ||
      !cursor
    ) {
      return;
    }
    const generation = listGenerationRef.current;
    const requestMutationVersion = mutationVersionRef.current;
    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    setError(null);
    setErrorSource(null);
    try {
      const page = await listNotifications(cursor);
      if (
        !isOwnerGenerationCurrent(ownerGeneration) ||
        generation !== listGenerationRef.current
      ) {
        return;
      }
      nextCursorRef.current = page.nextCursor;
      setHasNextPage(page.nextCursor !== null);
      updateItems(
        (current) => {
          const seen = new Set(current.map((item) => item.id));
          const additions = applyResponseOverrides(
            page.items,
            overridesRef.current,
            readAllOverrideRef.current,
            requestMutationVersion,
          ).filter((item) => !seen.has(item.id));
          return [...current, ...additions];
        },
        ownerGeneration,
      );
    } catch (caught) {
      if (
        !isOwnerGenerationCurrent(ownerGeneration) ||
        generation !== listGenerationRef.current
      ) {
        return;
      }
      setError(normalizeApiError(caught));
      setErrorSource('loadMore');
    } finally {
      if (generation === listGenerationRef.current) {
        loadMoreInFlightRef.current = false;
        if (isOwnerGenerationCurrent(ownerGeneration)) {
          setLoadingMore(false);
        }
      }
    }
  }, [captureOwnerGeneration, isOwnerGenerationCurrent, updateItems]);

  const refreshForFocus = useCallback(async () => {
    const ownerGeneration = captureOwnerGeneration();
    if (!isOwnerGenerationCurrent(ownerGeneration)) {
      return;
    }
    await Promise.all([
      loadFirstPage(hasUsablePageRef.current ? 'silent' : 'initial', ownerGeneration),
      reconcileUnreadCount(ownerGeneration),
    ]);
  }, [captureOwnerGeneration, isOwnerGenerationCurrent, loadFirstPage, reconcileUnreadCount]);

  const refresh = useCallback(async () => {
    const ownerGeneration = captureOwnerGeneration();
    if (!isOwnerGenerationCurrent(ownerGeneration)) {
      return;
    }
    setGlobalMutationError(null);
    await Promise.all([
      loadFirstPage('refresh', ownerGeneration),
      reconcileUnreadCount(ownerGeneration),
    ]);
  }, [captureOwnerGeneration, isOwnerGenerationCurrent, loadFirstPage, reconcileUnreadCount]);

  const markRead = useCallback(
    async (notificationId: string): Promise<boolean> => {
      const ownerGeneration = captureOwnerGeneration();
      if (
        !isOwnerGenerationCurrent(ownerGeneration) ||
        readLocksRef.current.has(notificationId)
      ) {
        return false;
      }
      const notification = itemsRef.current.find((item) => item.id === notificationId);
      if (notification?.is_read) {
        return true;
      }
      readLocksRef.current.add(notificationId);
      setPendingReadIds(new Set(readLocksRef.current));
      clearRowError(notificationId, ownerGeneration);
      try {
        await markNotificationRead(notificationId);
        if (!isOwnerGenerationCurrent(ownerGeneration)) {
          return false;
        }
        applyLocalOverride(notificationId, { isRead: true }, ownerGeneration);
        if (notification && !notification.is_read) {
          setUnreadCount((current) => (current === null ? null : Math.max(0, current - 1)));
        }
        await reconcileUnreadCount(ownerGeneration);
        return isOwnerGenerationCurrent(ownerGeneration);
      } catch (caught) {
        if (!isOwnerGenerationCurrent(ownerGeneration)) {
          return false;
        }
        setRowError(notificationId, normalizeApiError(caught), ownerGeneration);
        return false;
      } finally {
        readLocksRef.current.delete(notificationId);
        if (isOwnerGenerationCurrent(ownerGeneration)) {
          setPendingReadIds(new Set(readLocksRef.current));
        }
      }
    },
    [
      applyLocalOverride,
      captureOwnerGeneration,
      clearRowError,
      isOwnerGenerationCurrent,
      reconcileUnreadCount,
      setRowError,
    ],
  );

  const markAllRead = useCallback(async (): Promise<boolean> => {
    const ownerGeneration = captureOwnerGeneration();
    if (!isOwnerGenerationCurrent(ownerGeneration) || markAllLockRef.current) {
      return false;
    }
    markAllLockRef.current = true;
    setMarkingAllRead(true);
    setGlobalMutationError(null);
    try {
      await markAllNotificationsRead();
      if (!isOwnerGenerationCurrent(ownerGeneration)) {
        return false;
      }
      mutationVersionRef.current += 1;
      readAllOverrideRef.current = { version: mutationVersionRef.current };
      updateItems(
        (current) => current.map((item) => (item.is_read ? item : { ...item, is_read: true })),
        ownerGeneration,
      );
      setUnreadCount(0);
      await reconcileUnreadCount(ownerGeneration);
      return isOwnerGenerationCurrent(ownerGeneration);
    } catch (caught) {
      if (!isOwnerGenerationCurrent(ownerGeneration)) {
        return false;
      }
      setGlobalMutationError(normalizeApiError(caught));
      return false;
    } finally {
      markAllLockRef.current = false;
      if (isOwnerGenerationCurrent(ownerGeneration)) {
        setMarkingAllRead(false);
      }
    }
  }, [captureOwnerGeneration, isOwnerGenerationCurrent, reconcileUnreadCount, updateItems]);

  const respondToInvitation = useCallback(
    async (
      notificationId: string,
      invitationId: string,
      tripId: string,
      action: InvitationAction,
    ): Promise<boolean> => {
      const ownerGeneration = captureOwnerGeneration();
      if (
        !isOwnerGenerationCurrent(ownerGeneration) ||
        invitationLocksRef.current.has(notificationId)
      ) {
        return false;
      }
      invitationLocksRef.current.set(notificationId, action);
      setPendingInvitationActions(new Map(invitationLocksRef.current));
      clearRowError(notificationId, ownerGeneration);
      try {
        if (action === 'accept') {
          await acceptTripInvitation(invitationId);
        } else {
          await declineTripInvitation(invitationId);
        }

        if (!isOwnerGenerationCurrent(ownerGeneration)) {
          return false;
        }

        const nextStatus: InvitationStatus = action === 'accept' ? 'ACCEPTED' : 'DECLINED';
        applyLocalOverride(notificationId, { invitationStatus: nextStatus }, ownerGeneration);
        if (action === 'accept') {
          publishTripEvent({ type: 'membershipAdded', tripId });
        }

        if (!isOwnerGenerationCurrent(ownerGeneration)) {
          return false;
        }

        try {
          await markNotificationRead(notificationId);
          if (!isOwnerGenerationCurrent(ownerGeneration)) {
            return false;
          }
          const notification = itemsRef.current.find((item) => item.id === notificationId);
          applyLocalOverride(notificationId, { isRead: true }, ownerGeneration);
          if (notification && !notification.is_read) {
            setUnreadCount((current) => (current === null ? null : Math.max(0, current - 1)));
          }
        } catch (caught) {
          if (!isOwnerGenerationCurrent(ownerGeneration)) {
            return false;
          }
          setRowError(notificationId, normalizeApiError(caught), ownerGeneration);
        }

        if (!isOwnerGenerationCurrent(ownerGeneration)) {
          return false;
        }
        await Promise.all([
          loadFirstPage('silent', ownerGeneration),
          reconcileUnreadCount(ownerGeneration),
        ]);
        return isOwnerGenerationCurrent(ownerGeneration);
      } catch (caught) {
        if (!isOwnerGenerationCurrent(ownerGeneration)) {
          return false;
        }
        const nextError = normalizeApiError(caught);
        setRowError(notificationId, nextError, ownerGeneration);
        if (nextError.status === 404 || nextError.status === 409) {
          applyLocalOverride(notificationId, { invitationStatus: null }, ownerGeneration);
          await Promise.all([
            loadFirstPage('silent', ownerGeneration),
            reconcileUnreadCount(ownerGeneration),
          ]);
        }
        return false;
      } finally {
        invitationLocksRef.current.delete(notificationId);
        if (isOwnerGenerationCurrent(ownerGeneration)) {
          setPendingInvitationActions(new Map(invitationLocksRef.current));
        }
      }
    },
    [
      applyLocalOverride,
      captureOwnerGeneration,
      clearRowError,
      isOwnerGenerationCurrent,
      loadFirstPage,
      reconcileUnreadCount,
      setRowError,
    ],
  );

  useEffect(() => {
    const ownerGeneration = captureOwnerGeneration();
    if (!isOwnerGenerationCurrent(ownerGeneration)) {
      return;
    }
    let cancelled = false;
    const requestId = countRequestRef.current + 1;
    countRequestRef.current = requestId;
    const requestMutationVersion = mutationVersionRef.current;

    async function hydrateUnreadCount() {
      try {
        const count = await getUnreadCount();
        if (
          !cancelled &&
          isOwnerGenerationCurrent(ownerGeneration) &&
          requestId === countRequestRef.current &&
          requestMutationVersion === mutationVersionRef.current
        ) {
          setUnreadCount(count);
        }
      } catch {
        // Focus and foreground transitions provide the next retry.
      }
    }

    void hydrateUnreadCount();
    return () => {
      cancelled = true;
    };
  }, [captureOwnerGeneration, isOwnerGenerationCurrent]);

  useEffect(() => {
    const ownerGeneration = captureOwnerGeneration();
    if (!isOwnerGenerationCurrent(ownerGeneration)) {
      return;
    }
    appStateRef.current = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const becameActive = appStateRef.current !== 'active' && nextState === 'active';
      appStateRef.current = nextState;
      if (!becameActive || !isOwnerGenerationCurrent(ownerGeneration)) {
        return;
      }
      void reconcileUnreadCount(ownerGeneration);
      if (hasRequestedListRef.current) {
        void loadFirstPage(
          hasUsablePageRef.current ? 'silent' : 'initial',
          ownerGeneration,
        );
      }
    });
    return () => subscription?.remove();
  }, [
    captureOwnerGeneration,
    isOwnerGenerationCurrent,
    loadFirstPage,
    reconcileUnreadCount,
  ]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      status,
      error,
      errorSource,
      refreshing,
      loadingMore,
      hasNextPage,
      unreadCount,
      markingAllRead,
      pendingReadIds,
      pendingInvitationActions,
      rowErrors,
      globalMutationError,
      refreshForFocus,
      refresh,
      loadMore,
      markRead,
      markAllRead,
      respondToInvitation,
    }),
    [
      error,
      errorSource,
      globalMutationError,
      hasNextPage,
      items,
      loadMore,
      loadingMore,
      markAllRead,
      markRead,
      markingAllRead,
      pendingInvitationActions,
      pendingReadIds,
      refresh,
      refreshForFocus,
      refreshing,
      respondToInvitation,
      rowErrors,
      status,
      unreadCount,
    ],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function NotificationsProvider({ children, ownerUserId }: NotificationsProviderProps) {
  return (
    <OwnedNotificationsProvider key={ownerUserId ?? 'signed-out'} ownerUserId={ownerUserId}>
      {children}
    </OwnedNotificationsProvider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
}
