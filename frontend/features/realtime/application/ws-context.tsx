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

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const [wsStatus, setWsStatus] = useState<WsConnectionStatus>("disconnected");

  useEffect(() => {
    // Subscribe to status changes from wsManager — covers both connect and disconnect
    const unsubscribe = wsManager.onStatusChange(setWsStatus);

    if (authStatus === "authenticated") {
      wsManager.connect();
    } else {
      wsManager.disconnect();
    }

    return () => {
      unsubscribe();
      wsManager.disconnect();
    };
  }, [authStatus]);

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
