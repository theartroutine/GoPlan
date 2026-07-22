import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type ApiError, normalizeApiError } from '@/shared/api/errors';
import { useAppForegroundEffect } from '@/shared/hooks/useAppForegroundEffect';
import { listPendingInvitations } from '../api';
import { subscribeToTripEvents } from '../tripEvents';
import type { TripInvitation } from '../types';

export type PendingInvitationsStatus = 'idle' | 'loading' | 'ready' | 'error';
export type PendingInvitationsLoadMode = 'initial' | 'refresh' | 'silent';

function mergeInvitations(
  current: TripInvitation[],
  incoming: TripInvitation[],
): TripInvitation[] {
  const byId = new Map(current.map((invitation) => [invitation.id, invitation]));
  for (const invitation of incoming) {
    byId.set(invitation.id, invitation);
  }
  return Array.from(byId.values()).sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
}

export function usePendingInvitations(tripId: string | undefined, enabled: boolean) {
  const [items, setItems] = useState<TripInvitation[]>([]);
  const [status, setStatus] = useState<PendingInvitationsStatus>('idle');
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stateTripId, setStateTripId] = useState<string | undefined>(undefined);
  const requestIdRef = useRef(0);
  const loadedTripIdRef = useRef<string | null>(null);

  const load = useCallback(
    async (mode: PendingInvitationsLoadMode = 'silent') => {
      if (!enabled || !tripId) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const hasCurrentData = loadedTripIdRef.current === tripId;
      setError(null);
      if (mode === 'initial' || !hasCurrentData) {
        setStateTripId(tripId);
        setItems([]);
        setStatus('loading');
      } else if (mode === 'refresh') {
        setRefreshing(true);
      }

      try {
        const invitations = await listPendingInvitations(tripId);
        if (requestId !== requestIdRef.current) {
          return;
        }
        loadedTripIdRef.current = tripId;
        setItems(invitations);
        setStatus('ready');
      } catch (caught) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setError(normalizeApiError(caught));
        setStatus(hasCurrentData ? 'ready' : 'error');
      } finally {
        if (requestId === requestIdRef.current) {
          setRefreshing(false);
        }
      }
    },
    [enabled, tripId],
  );

  useEffect(
    () =>
      subscribeToTripEvents((event) => {
        if (event.type !== 'invitationsSent' || event.tripId !== tripId) {
          return;
        }
        requestIdRef.current += 1;
        const canMergeCurrent = loadedTripIdRef.current === event.tripId;
        loadedTripIdRef.current = event.tripId;
        setStateTripId(event.tripId);
        setItems((current) =>
          mergeInvitations(canMergeCurrent ? current : [], event.invitations),
        );
        setError(null);
        setRefreshing(false);
        setStatus('ready');
      }),
    [tripId],
  );

  const reconcileOnForeground = useCallback(() => {
    if (enabled && tripId) {
      void load(loadedTripIdRef.current === tripId ? 'silent' : 'initial');
    }
  }, [enabled, load, tripId]);

  useAppForegroundEffect(reconcileOnForeground);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !tripId) {
        return undefined;
      }
      void load(loadedTripIdRef.current === tripId ? 'silent' : 'initial');
      return () => {
        requestIdRef.current += 1;
      };
    }, [enabled, load, tripId]),
  );

  const stateMatchesTrip = enabled && Boolean(tripId) && stateTripId === tripId;

  return {
    items: stateMatchesTrip ? items : [],
    status: stateMatchesTrip ? status : enabled && tripId ? 'loading' : 'idle',
    error: stateMatchesTrip ? error : null,
    refreshing: stateMatchesTrip ? refreshing : false,
    load,
  };
}
