"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { AuthProvider } from "@/features/auth/application/auth-context";
import { WebSocketProvider } from "@/features/realtime/application/ws-context";
import { ErrorBoundary } from "@/shared/ui/error-boundary";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <WebSocketProvider>{children}</WebSocketProvider>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ErrorBoundary>
  );
}
