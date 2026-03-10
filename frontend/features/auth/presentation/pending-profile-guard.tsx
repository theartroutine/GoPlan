"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/application/auth-context";
import { FullPageSpinner } from "@/shared/ui/full-page-spinner";

export function PendingProfileGuard({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  if (status === "idle" || status === "loading") {
    return <FullPageSpinner />;
  }

  if (status !== "pending_profile") {
    return null;
  }

  return <>{children}</>;
}
