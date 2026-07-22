import { useCallback, useRef, useState } from 'react';
import type { ApiError } from '@/shared/api/errors';
import { normalizeApiError } from '@/shared/api/errors';
import type { CursorPage } from '@/shared/api/pagination';

export type CursorListStatus = 'loading' | 'ready' | 'error';
export type CursorListLoadMode = 'initial' | 'refresh' | 'silent';
export type CursorListErrorSource = 'initial' | 'refresh' | 'loadMore' | null;

interface ItemOverride<T> {
  version: number;
  item?: T;
  removed: boolean;
}

interface CursorListOptions<T> {
  getKey: (item: T) => string;
  loadPage: (cursor?: string | null) => Promise<CursorPage<T>>;
}

function applyOverrides<T>(
  serverItems: T[],
  overrides: Map<string, ItemOverride<T>>,
  requestOverrideVersion: number,
  getKey: (item: T) => string,
  includeMissingAdditions: boolean,
): T[] {
  const seen = new Set<string>();
  const reconciled: T[] = [];

  for (const serverItem of serverItems) {
    const key = getKey(serverItem);
    const override = overrides.get(key);
    const activeOverride = override && override.version > requestOverrideVersion ? override : undefined;
    if (activeOverride?.removed) {
      continue;
    }
    const item = activeOverride?.item ?? serverItem;
    seen.add(key);
    reconciled.push(item);
  }

  if (!includeMissingAdditions) {
    return reconciled;
  }

  const additions: T[] = [];
  for (const [key, override] of overrides) {
    if (
      override.version > requestOverrideVersion &&
      !override.removed &&
      override.item &&
      !seen.has(key)
    ) {
      additions.push(override.item);
      seen.add(key);
    }
  }
  return [...additions.reverse(), ...reconciled];
}

export function useCursorList<T>({ getKey, loadPage }: CursorListOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [status, setStatus] = useState<CursorListStatus>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const [errorSource, setErrorSource] = useState<CursorListErrorSource>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const firstPageRequestRef = useRef(0);
  const firstPageInFlightRef = useRef<number | null>(null);
  const listGenerationRef = useRef(0);
  const loadMoreInFlightRef = useRef(false);
  const hasUsablePageRef = useRef(false);
  const overridesRef = useRef(new Map<string, ItemOverride<T>>());
  const overrideVersionRef = useRef(0);

  const loadFirstPage = useCallback(
    async (mode: CursorListLoadMode) => {
      const requestId = firstPageRequestRef.current + 1;
      firstPageRequestRef.current = requestId;
      firstPageInFlightRef.current = requestId;
      listGenerationRef.current += 1;
      const requestOverrideVersion = overrideVersionRef.current;
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
        const page = await loadPage();
        if (requestId !== firstPageRequestRef.current) {
          return;
        }
        nextCursorRef.current = page.nextCursor;
        setHasNextPage(page.nextCursor !== null);
        setItems(
          applyOverrides(
            page.items,
            overridesRef.current,
            requestOverrideVersion,
            getKey,
            true,
          ),
        );
        hasUsablePageRef.current = true;
        setStatus('ready');
      } catch (caught) {
        if (requestId !== firstPageRequestRef.current) {
          return;
        }
        setError(normalizeApiError(caught));
        if (mode === 'initial' || !hasUsablePageRef.current) {
          setErrorSource('initial');
          setStatus('error');
        } else {
          setErrorSource('refresh');
        }
      } finally {
        if (requestId === firstPageRequestRef.current) {
          firstPageInFlightRef.current = null;
          setRefreshing(false);
        }
      }
    },
    [getKey, loadPage],
  );

  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (firstPageInFlightRef.current !== null || loadMoreInFlightRef.current || !cursor) {
      return;
    }

    const generation = listGenerationRef.current;
    const requestOverrideVersion = overrideVersionRef.current;
    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    setError(null);
    setErrorSource(null);
    try {
      const page = await loadPage(cursor);
      if (generation !== listGenerationRef.current) {
        return;
      }
      nextCursorRef.current = page.nextCursor;
      setHasNextPage(page.nextCursor !== null);
      setItems((current) => {
        const seen = new Set(current.map(getKey));
        const nextItems = applyOverrides(
          page.items,
          overridesRef.current,
          requestOverrideVersion,
          getKey,
          false,
        ).filter((item) => !seen.has(getKey(item)));
        return [...current, ...nextItems];
      });
    } catch (caught) {
      if (generation !== listGenerationRef.current) {
        return;
      }
      setError(normalizeApiError(caught));
      setErrorSource('loadMore');
    } finally {
      if (generation === listGenerationRef.current) {
        loadMoreInFlightRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [getKey, loadPage]);

  const upsertLocalItem = useCallback(
    (item: T) => {
      const key = getKey(item);
      overrideVersionRef.current += 1;
      overridesRef.current.set(key, {
        version: overrideVersionRef.current,
        item,
        removed: false,
      });
      setItems((current) => [item, ...current.filter((candidate) => getKey(candidate) !== key)]);
    },
    [getKey],
  );

  const removeLocalItem = useCallback((key: string) => {
    overrideVersionRef.current += 1;
    overridesRef.current.set(key, {
      version: overrideVersionRef.current,
      removed: true,
    });
    setItems((current) => current.filter((item) => getKey(item) !== key));
  }, [getKey]);

  return {
    items,
    status,
    error,
    errorSource,
    refreshing,
    loadingMore,
    hasNextPage,
    loadFirstPage,
    loadMore,
    upsertLocalItem,
    removeLocalItem,
  };
}
