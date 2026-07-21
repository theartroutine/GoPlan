import { useCallback, useEffect, useRef, useState } from 'react';
import { type ApiError, normalizeApiError } from '@/shared/api/errors';
import { listTrips } from '../api';
import { subscribeToTripEvents, type TripEvent } from '../tripEvents';
import type { Trip, TripListItem, TripStatus } from '../types';

export type TripsListStatus = 'loading' | 'ready' | 'error';

interface TripListOverride {
  version: number;
  trip?: Trip;
  status?: TripStatus;
  removed?: boolean;
}

function applyUpdatedTrip(item: TripListItem, trip: Trip): TripListItem {
  return {
    ...item,
    name: trip.name,
    destination: trip.destination,
    cover_image_url: trip.cover_image_url,
    start_date: trip.start_date,
    end_date: trip.end_date,
    status: trip.status,
    currency_code: trip.currency_code,
    budget_estimate: trip.budget_estimate,
  };
}

function applyOverride(item: TripListItem, override: TripListOverride | undefined): TripListItem | null {
  if (!override) {
    return item;
  }
  if (override.removed) {
    return null;
  }
  let next = override.trip ? applyUpdatedTrip(item, override.trip) : item;
  if (override.status) {
    next = { ...next, status: override.status };
  }
  return next;
}

function applyOverrides(
  items: TripListItem[],
  overrides: Map<string, TripListOverride>,
  requestEventVersion: number,
): TripListItem[] {
  return items.flatMap((item) => {
    const override = overrides.get(item.id);
    const next = applyOverride(item, override && override.version > requestEventVersion ? override : undefined);
    return next ? [next] : [];
  });
}

function overrideFromEvent(event: TripEvent, version: number, current?: TripListOverride): [string, TripListOverride] {
  if (event.type === 'updated') {
    return [event.trip.id, { ...current, version, trip: event.trip, status: event.trip.status, removed: false }];
  }
  if (event.type === 'statusChanged') {
    return [event.tripId, { ...current, version, status: event.status }];
  }
  return [event.tripId, { ...current, version, removed: true }];
}

export function useTripsList() {
  const [items, setItems] = useState<TripListItem[]>([]);
  const [status, setStatus] = useState<TripsListStatus>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const firstPageRequestRef = useRef(0);
  const firstPageInFlightRef = useRef<number | null>(null);
  const listGenerationRef = useRef(0);
  const loadMoreInFlightRef = useRef(false);
  const overridesRef = useRef(new Map<string, TripListOverride>());
  const eventVersionRef = useRef(0);

  useEffect(
    () =>
      subscribeToTripEvents((event) => {
        const eventTripId = event.type === 'updated' ? event.trip.id : event.tripId;
        eventVersionRef.current += 1;
        const [tripId, override] = overrideFromEvent(
          event,
          eventVersionRef.current,
          overridesRef.current.get(eventTripId),
        );
        overridesRef.current.set(tripId, override);
        setItems((current) =>
          current.flatMap((item) => {
            if (item.id !== tripId) {
              return [item];
            }
            const next = applyOverride(item, override);
            return next ? [next] : [];
          }),
        );
      }),
    [],
  );

  const loadFirstPage = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    const requestId = firstPageRequestRef.current + 1;
    firstPageRequestRef.current = requestId;
    firstPageInFlightRef.current = requestId;
    listGenerationRef.current += 1;
    const requestEventVersion = eventVersionRef.current;
    loadMoreInFlightRef.current = false;
    setLoadingMore(false);
    if (mode === 'initial') {
      setStatus('loading');
    }
    if (mode === 'refresh') {
      setRefreshing(true);
    }
    try {
      const page = await listTrips();
      if (requestId !== firstPageRequestRef.current) {
        return;
      }
      nextCursorRef.current = page.nextCursor;
      setItems(applyOverrides(page.items, overridesRef.current, requestEventVersion));
      setError(null);
      setStatus('ready');
    } catch (err) {
      if (requestId !== firstPageRequestRef.current) {
        return;
      }
      // A silent focus refresh must not blank out an already rendered list.
      if (mode === 'initial') {
        setError(normalizeApiError(err));
        setStatus('error');
      } else if (mode === 'refresh') {
        // Keep the rendered list available while exposing the refresh failure to callers.
        setError(normalizeApiError(err));
      }
    } finally {
      if (requestId === firstPageRequestRef.current) {
        firstPageInFlightRef.current = null;
        setRefreshing(false);
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (firstPageInFlightRef.current !== null || loadMoreInFlightRef.current || !cursor) {
      return;
    }
    const generation = listGenerationRef.current;
    const requestEventVersion = eventVersionRef.current;
    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listTrips(cursor);
      if (generation !== listGenerationRef.current) {
        return;
      }
      nextCursorRef.current = page.nextCursor;
      setItems((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const newItems = applyOverrides(page.items, overridesRef.current, requestEventVersion).filter(
          (trip) => !seen.has(trip.id),
        );
        return [...prev, ...newItems];
      });
    } catch (err) {
      if (generation !== listGenerationRef.current) {
        return;
      }
      // Keep the loaded pages; the next onEndReached retries from the same cursor.
      setError(normalizeApiError(err));
    } finally {
      if (generation === listGenerationRef.current) {
        loadMoreInFlightRef.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  return { items, status, error, refreshing, loadingMore, loadFirstPage, loadMore };
}
