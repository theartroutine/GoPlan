import type { Friend } from './types';

export type FriendEvent =
  | { type: 'friendshipAdded'; friendship: Friend }
  | { type: 'friendshipRemoved'; friendshipId: string };

type FriendEventListener = (event: FriendEvent) => void;

interface OwnedFriendEventListener {
  ownerUserId: string;
  listener: FriendEventListener;
}

const listeners = new Set<OwnedFriendEventListener>();

export function publishFriendEvent(ownerUserId: string, event: FriendEvent): void {
  for (const subscription of listeners) {
    if (subscription.ownerUserId === ownerUserId) {
      subscription.listener(event);
    }
  }
}

export function subscribeToFriendEvents(ownerUserId: string, listener: FriendEventListener): () => void {
  const subscription = { ownerUserId, listener };
  listeners.add(subscription);
  return () => listeners.delete(subscription);
}
