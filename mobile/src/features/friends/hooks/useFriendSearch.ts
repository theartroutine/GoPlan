import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { type ApiError, normalizeApiError } from '@/shared/api/errors';
import { searchFriendUser, sendFriendRequest } from '../api';
import type { FriendRequest, FriendUser } from '../types';

export type FriendSearchStatus = 'idle' | 'searching' | 'found' | 'notFound' | 'error';
export type FriendRequestSendStatus = 'idle' | 'sending' | 'sent';

export function useFriendSearch() {
  const [query, setQueryValue] = useState('');
  const [user, setUser] = useState<FriendUser | null>(null);
  const [searchStatus, setSearchStatus] = useState<FriendSearchStatus>('idle');
  const [searchError, setSearchError] = useState<ApiError | null>(null);
  const [sendStatus, setSendStatus] = useState<FriendRequestSendStatus>('idle');
  const [sendError, setSendError] = useState<ApiError | null>(null);
  const [friendRequest, setFriendRequest] = useState<FriendRequest | null>(null);

  const activeRef = useRef(true);
  const searchGenerationRef = useRef(0);
  const queryVersionRef = useRef(0);
  const searchControllerRef = useRef<AbortController | null>(null);
  const sendLockRef = useRef(false);

  const cancelPendingSearch = useCallback(() => {
    searchGenerationRef.current += 1;
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
  }, []);

  useFocusEffect(
    useCallback(() => {
      activeRef.current = true;
      setSearchStatus((current) => (current === 'searching' ? 'idle' : current));

      return () => {
        activeRef.current = false;
        cancelPendingSearch();
      };
    }, [cancelPendingSearch]),
  );

  const setQuery = useCallback(
    (nextQuery: string) => {
      cancelPendingSearch();
      queryVersionRef.current += 1;
      setQueryValue(nextQuery);
      setUser(null);
      setSearchStatus('idle');
      setSearchError(null);
      setSendStatus('idle');
      setSendError(null);
      setFriendRequest(null);
    },
    [cancelPendingSearch],
  );

  const search = useCallback(async () => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      cancelPendingSearch();
      setUser(null);
      setSearchStatus('idle');
      setSearchError(null);
      return;
    }

    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    const generation = searchGenerationRef.current + 1;
    searchGenerationRef.current = generation;

    setUser(null);
    setSearchStatus('searching');
    setSearchError(null);
    setSendStatus('idle');
    setSendError(null);
    setFriendRequest(null);

    try {
      const foundUser = await searchFriendUser(normalizedQuery, controller.signal);
      if (!activeRef.current || controller.signal.aborted || generation !== searchGenerationRef.current) {
        return;
      }

      setUser(foundUser);
      setSearchStatus(foundUser ? 'found' : 'notFound');
    } catch (caught) {
      if (!activeRef.current || controller.signal.aborted || generation !== searchGenerationRef.current) {
        return;
      }

      setUser(null);
      setSearchError(normalizeApiError(caught));
      setSearchStatus('error');
    } finally {
      if (searchControllerRef.current === controller) {
        searchControllerRef.current = null;
      }
    }
  }, [cancelPendingSearch, query]);

  const sendRequest = useCallback(async () => {
    if (!user || sendLockRef.current) {
      return;
    }

    sendLockRef.current = true;
    const queryVersion = queryVersionRef.current;
    setSendStatus('sending');
    setSendError(null);

    try {
      // Use the server-returned tag instead of the user's raw search input.
      const createdRequest = await sendFriendRequest(user.identify_tag);
      if (queryVersion !== queryVersionRef.current) {
        return;
      }

      setFriendRequest(createdRequest);
      setSendStatus('sent');
    } catch (caught) {
      if (queryVersion !== queryVersionRef.current) {
        return;
      }

      setSendError(normalizeApiError(caught));
      setSendStatus('idle');
    } finally {
      sendLockRef.current = false;
    }
  }, [user]);

  return {
    query,
    setQuery,
    user,
    searchStatus,
    searchError,
    search,
    sendStatus,
    sendError,
    friendRequest,
    sendRequest,
  };
}
