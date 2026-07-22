import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

type ForegroundListener = () => void;

const listeners = new Set<ForegroundListener>();
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let previousAppState: AppStateStatus = AppState.currentState;

function stopListeningWhenIdle(): void {
  if (listeners.size > 0 || !appStateSubscription) {
    return;
  }
  appStateSubscription.remove();
  appStateSubscription = null;
  previousAppState = AppState.currentState;
}

function subscribeToAppForeground(listener: ForegroundListener): () => void {
  listeners.add(listener);
  if (!appStateSubscription) {
    previousAppState = AppState.currentState;
    appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      const returnedToForeground = previousAppState !== 'active' && nextAppState === 'active';
      previousAppState = nextAppState;
      if (returnedToForeground) {
        for (const currentListener of Array.from(listeners)) {
          currentListener();
        }
      }
    });
  }

  return () => {
    listeners.delete(listener);
    stopListeningWhenIdle();
  };
}

export function useAppForegroundEffect(listener: ForegroundListener): void {
  useEffect(() => subscribeToAppForeground(listener), [listener]);
}
