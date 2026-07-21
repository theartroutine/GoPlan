import { useCallback, useRef, useState } from 'react';
import { type ApiError, normalizeApiError } from '@/shared/api/errors';
import { listTrips } from '../api';
import type { TripListItem } from '../types';

export type TripsListStatus = 'loading' | 'ready' | 'error';

export function useTripsList() {
  const [items, setItems] = useState<TripListItem[]>([]);
  const [status, setStatus] = useState<TripsListStatus>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const loadFirstPage = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    if (mode === 'initial') {
      setStatus('loading');
    }
    if (mode === 'refresh') {
      setRefreshing(true);
    }
    try {
      const page = await listTrips();
      nextCursorRef.current = page.nextCursor;
      setItems(page.items);
      setError(null);
      setStatus('ready');
    } catch (err) {
      // A silent focus refresh must not blank out an already rendered list.
      if (mode === 'initial') {
        setError(normalizeApiError(err));
        setStatus('error');
      } else if (mode === 'refresh') {
        // Keep the rendered list available while exposing the refresh failure to callers.
        setError(normalizeApiError(err));
      }
    } finally {
      setRefreshing(false);
      inFlightRef.current = false;
    }
  }, []);

  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (inFlightRef.current || !cursor) {
      return;
    }
    inFlightRef.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listTrips(cursor);
      nextCursorRef.current = page.nextCursor;
      setItems((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...page.items.filter((t) => !seen.has(t.id))];
      });
    } catch (err) {
      // Keep the loaded pages; the next onEndReached retries from the same cursor.
      setError(normalizeApiError(err));
    } finally {
      setLoadingMore(false);
      inFlightRef.current = false;
    }
  }, []);

  return { items, status, error, refreshing, loadingMore, loadFirstPage, loadMore };
}
