import type { Trip, TripStatus } from './types';

export type TripEvent =
  | { type: 'updated'; trip: Trip }
  | { type: 'statusChanged'; tripId: string; status: TripStatus }
  | { type: 'removed'; tripId: string };

type TripEventListener = (event: TripEvent) => void;

const listeners = new Set<TripEventListener>();

export function publishTripEvent(event: TripEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function subscribeToTripEvents(listener: TripEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
