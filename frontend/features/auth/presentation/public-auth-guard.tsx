"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/application/auth-context";
import { FullPageSpinner } from "@/shared/ui/full-page-spinner";

export function PublicAuthGuard({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
    if (status === "pending_profile") {
      router.replace("/setup-profile");
    }
  }, [status, router]);

  if (status === "idle" || status === "loading") {
    return <FullPageSpinner />;
  }

  if (status === "authenticated" || status === "pending_profile") {
    return null;
  }

  return <>{children}</>;
}
