"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { WsConnectionStatus } from "@/features/realtime/domain/types";
import { useAuth } from "@/features/auth/application/auth-context";
import { wsManager } from "@/features/realtime/infrastructure/ws-manager";

type WebSocketContextValue = {
  status: WsConnectionStatus;
};

const WebSocketContext = createContext<WebSocketContextValue | null>(null);
const WS_AUTH_TRANSITION_DEBOUNCE_MS = 500;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const [wsStatus, setWsStatus] = useState<WsConnectionStatus>("disconnected");

  useEffect(() => {
    const unsubscribe = wsManager.onStatusChange(setWsStatus);

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const transitionTimer = setTimeout(() => {
      if (authStatus === "authenticated") {
        wsManager.connect();
        return;
      }

      wsManager.disconnect();
    }, WS_AUTH_TRANSITION_DEBOUNCE_MS);

    return () => {
      clearTimeout(transitionTimer);
    };
  }, [authStatus]);

  useEffect(() => {
    return () => {
      wsManager.disconnect();
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ status: wsStatus }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error("useWebSocket must be used within WebSocketProvider");
  }
  return ctx;
}
