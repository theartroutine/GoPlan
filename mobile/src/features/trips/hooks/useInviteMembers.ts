import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { type ApiError, normalizeApiError } from '@/shared/api/errors';
import { useAppForegroundEffect } from '@/shared/hooks/useAppForegroundEffect';
import { listInvitableFriends, sendTripInvitations } from '../api';
import { publishTripEvent } from '../tripEvents';
import type { InvitableFriend } from '../types';

export const MAX_INVITEES_PER_REQUEST = 20;

export type InviteMembersLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

const EMPTY_SELECTED_IDS: ReadonlySet<string> = new Set();

export function useInviteMembers(tripId: string | undefined, enabled: boolean) {
  const [items, setItems] = useState<InvitableFriend[]>([]);
  const [status, setStatus] = useState<InviteMembersLoadStatus>('idle');
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stateTripId, setStateTripId] = useState<string | undefined>(undefined);
  const selectedIdsRef = useRef<ReadonlySet<string>>(new Set());
  const requestIdRef = useRef(0);
  const loadedTripIdRef = useRef<string | null>(null);
  const submitLockRef = useRef(false);

  const commitSelection = useCallback((nextSelection: ReadonlySet<string>) => {
    selectedIdsRef.current = nextSelection;
    setSelectedIds(nextSelection);
  }, []);

  const load = useCallback(
    async (mode: 'initial' | 'silent' = 'silent') => {
      if (!enabled || !tripId) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const hasCurrentData = loadedTripIdRef.current === tripId;
      setLoadError(null);
      if (mode === 'initial' || !hasCurrentData) {
        setStateTripId(tripId);
        setItems([]);
        commitSelection(new Set());
        setSelectionError(null);
        setSubmitError(null);
        setStatus('loading');
      }

      try {
        const friends = await listInvitableFriends(tripId);
        if (requestId !== requestIdRef.current) {
          return;
        }
        loadedTripIdRef.current = tripId;
        setItems(friends);
        const eligibleIds = new Set(friends.map((friend) => friend.id));
        commitSelection(
          new Set(Array.from(selectedIdsRef.current).filter((friendId) => eligibleIds.has(friendId))),
        );
        setSelectionError(null);
        setStatus('ready');
      } catch (caught) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setLoadError(normalizeApiError(caught));
        setStatus(hasCurrentData ? 'ready' : 'error');
      }
    },
    [commitSelection, enabled, tripId],
  );

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

  const reconcileOnForeground = useCallback(() => {
    if (enabled && tripId) {
      void load(loadedTripIdRef.current === tripId ? 'silent' : 'initial');
    }
  }, [enabled, load, tripId]);

  useAppForegroundEffect(reconcileOnForeground);

  const toggleSelection = useCallback(
    (friendId: string) => {
      if (submitLockRef.current) {
        return;
      }
      const current = selectedIdsRef.current;
      const next = new Set(current);
      if (next.has(friendId)) {
        next.delete(friendId);
        commitSelection(next);
        setSelectionError(null);
        return;
      }
      if (next.size >= MAX_INVITEES_PER_REQUEST) {
        setSelectionError(`You can select up to ${MAX_INVITEES_PER_REQUEST} friends.`);
        return;
      }
      next.add(friendId);
      commitSelection(next);
      setSelectionError(null);
      setSubmitError(null);
    },
    [commitSelection],
  );

  const submit = useCallback(async (): Promise<boolean> => {
    const inviteeIds = Array.from(selectedIdsRef.current);
    if (inviteeIds.length === 0) {
      setSelectionError('Select at least one friend.');
      return false;
    }
    if (inviteeIds.length > MAX_INVITEES_PER_REQUEST || !tripId || !enabled) {
      setSelectionError(`You can select up to ${MAX_INVITEES_PER_REQUEST} friends.`);
      return false;
    }
    if (submitLockRef.current) {
      return false;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    setSelectionError(null);
    setSubmitError(null);
    try {
      const invitations = await sendTripInvitations(tripId, inviteeIds);
      requestIdRef.current += 1;
      const submittedIds = new Set(inviteeIds);
      setItems((current) => current.filter((friend) => !submittedIds.has(friend.id)));
      commitSelection(new Set());
      publishTripEvent({ type: 'invitationsSent', tripId, invitations });
      return true;
    } catch (caught) {
      setSubmitError(normalizeApiError(caught));
      return false;
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }, [commitSelection, enabled, tripId]);

  const stateMatchesTrip = enabled && Boolean(tripId) && stateTripId === tripId;

  return {
    items: stateMatchesTrip ? items : [],
    status: stateMatchesTrip ? status : enabled && tripId ? 'loading' : 'idle',
    loadError: stateMatchesTrip ? loadError : null,
    selectedIds: stateMatchesTrip ? selectedIds : EMPTY_SELECTED_IDS,
    selectionError: stateMatchesTrip ? selectionError : null,
    submitError: stateMatchesTrip ? submitError : null,
    submitting: stateMatchesTrip ? submitting : false,
    load,
    toggleSelection,
    submit,
  };
}
