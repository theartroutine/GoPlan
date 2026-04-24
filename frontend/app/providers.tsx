"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { AuthProvider } from "@/features/auth/application/auth-context";
import { WebSocketProvider } from "@/features/realtime/application/ws-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WebSocketProvider>{children}</WebSocketProvider>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}
