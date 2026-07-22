import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/features/auth/session';
import { type ApiError, normalizeApiError } from '@/shared/api/errors';
import { listFriends, removeFriend as removeFriendApi } from '../api';
import { publishFriendEvent, subscribeToFriendEvents } from '../friendEvents';
import type { Friend } from '../types';
import { useCursorList } from './useCursorList';

const getFriendKey = (friend: Friend) => friend.friendship_id;

export function useFriendsList() {
  const { user } = useSession();
  const ownerUserId = user?.id;
  const list = useCursorList({ getKey: getFriendKey, loadPage: listFriends });
  const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(new Set());
  const [mutationError, setMutationError] = useState<ApiError | null>(null);
  const removingIdsRef = useRef(new Set<string>());
  const { removeLocalItem, upsertLocalItem } = list;

  useEffect(
    () => {
      if (!ownerUserId) {
        return;
      }
      return subscribeToFriendEvents(ownerUserId, (event) => {
        if (event.type === 'friendshipAdded') {
          upsertLocalItem(event.friendship);
        } else {
          removeLocalItem(event.friendshipId);
        }
      });
    },
    [ownerUserId, removeLocalItem, upsertLocalItem],
  );

  const removeFriend = useCallback(async (friendshipId: string): Promise<boolean> => {
    if (removingIdsRef.current.has(friendshipId)) {
      return false;
    }

    removingIdsRef.current.add(friendshipId);
    setRemovingIds(new Set(removingIdsRef.current));
    setMutationError(null);
    try {
      await removeFriendApi(friendshipId);
      if (ownerUserId) {
        publishFriendEvent(ownerUserId, { type: 'friendshipRemoved', friendshipId });
      }
      return true;
    } catch (caught) {
      setMutationError(normalizeApiError(caught));
      return false;
    } finally {
      removingIdsRef.current.delete(friendshipId);
      setRemovingIds(new Set(removingIdsRef.current));
    }
  }, [ownerUserId]);

  const clearMutationError = useCallback(() => setMutationError(null), []);

  return { ...list, removingIds, mutationError, removeFriend, clearMutationError };
}
