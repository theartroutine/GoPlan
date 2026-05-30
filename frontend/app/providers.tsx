"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";

import { AuthProvider } from "@/features/auth/application/auth-context";
import { WebSocketProvider } from "@/features/realtime/application/ws-context";
import { ErrorBoundary } from "@/shared/ui/error-boundary";

function isPublicSharePath(pathname: string | null): boolean {
  return pathname?.startsWith("/share/memories/") ?? false;
}

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isPublicSharePath(pathname)) {
    return (
      <ErrorBoundary>
        {children}
        <Toaster richColors position="top-right" />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <WebSocketProvider>{children}</WebSocketProvider>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ErrorBoundary>
  );
}
