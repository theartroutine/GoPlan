import { useCallback, useRef, useState } from 'react';
import { useSession } from '@/features/auth/session';
import { type ApiError, normalizeApiError } from '@/shared/api/errors';
import {
  acceptFriendRequest as acceptFriendRequestApi,
  cancelFriendRequest as cancelFriendRequestApi,
  declineFriendRequest as declineFriendRequestApi,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
} from '../api';
import { publishFriendEvent } from '../friendEvents';
import type { FriendRequest } from '../types';
import { type CursorListLoadMode, useCursorList } from './useCursorList';

export type FriendRequestAction = 'accept' | 'decline' | 'cancel';

const getRequestKey = (request: FriendRequest) => request.id;

export function useFriendRequests() {
  const { user } = useSession();
  const ownerUserId = user?.id;
  const incoming = useCursorList({
    getKey: getRequestKey,
    loadPage: listIncomingFriendRequests,
  });
  const outgoing = useCursorList({
    getKey: getRequestKey,
    loadPage: listOutgoingFriendRequests,
  });
  const removeIncomingRequest = incoming.removeLocalItem;
  const removeOutgoingRequest = outgoing.removeLocalItem;
  const loadIncomingFirstPage = incoming.loadFirstPage;
  const loadOutgoingFirstPage = outgoing.loadFirstPage;
  const [pendingActions, setPendingActions] = useState<ReadonlyMap<string, FriendRequestAction>>(new Map());
  const [mutationError, setMutationError] = useState<ApiError | null>(null);
  const pendingActionsRef = useRef(new Map<string, FriendRequestAction>());

  const performAction = useCallback(
    async (requestId: string, action: FriendRequestAction): Promise<boolean> => {
      if (pendingActionsRef.current.has(requestId)) {
        return false;
      }

      pendingActionsRef.current.set(requestId, action);
      setPendingActions(new Map(pendingActionsRef.current));
      setMutationError(null);
      try {
        if (action === 'accept') {
          const result = await acceptFriendRequestApi(requestId);
          removeIncomingRequest(result.friendRequestId);
          if (ownerUserId) {
            publishFriendEvent(ownerUserId, { type: 'friendshipAdded', friendship: result.friendship });
          }
        } else if (action === 'decline') {
          await declineFriendRequestApi(requestId);
          removeIncomingRequest(requestId);
        } else {
          await cancelFriendRequestApi(requestId);
          removeOutgoingRequest(requestId);
        }
        return true;
      } catch (caught) {
        setMutationError(normalizeApiError(caught));
        return false;
      } finally {
        pendingActionsRef.current.delete(requestId);
        setPendingActions(new Map(pendingActionsRef.current));
      }
    },
    [ownerUserId, removeIncomingRequest, removeOutgoingRequest],
  );

  const loadFirstPages = useCallback(
    async (mode: CursorListLoadMode) => {
      await Promise.all([loadIncomingFirstPage(mode), loadOutgoingFirstPage(mode)]);
    },
    [loadIncomingFirstPage, loadOutgoingFirstPage],
  );

  const clearMutationError = useCallback(() => setMutationError(null), []);

  return {
    incoming,
    outgoing,
    pendingActions,
    mutationError,
    performAction,
    loadFirstPages,
    clearMutationError,
  };
}
