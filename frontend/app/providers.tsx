"use client";

import type { ReactNode } from "react";

import { AuthProvider } from "@/features/auth/application/auth-context";

export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
