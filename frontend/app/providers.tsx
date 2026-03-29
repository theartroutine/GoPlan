"use client";

import type { ReactNode } from "react";

import { AuthProvider } from "@/features/auth/application/auth-context";
import { WebSocketProvider } from "@/features/realtime/application/ws-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WebSocketProvider>{children}</WebSocketProvider>
    </AuthProvider>
  );
}
