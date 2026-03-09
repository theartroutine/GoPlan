"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/application/auth-context";
import { Spinner } from "@/shared/ui/spinner";

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
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-foreground" />
      </div>
    );
  }

  if (status === "authenticated" || status === "pending_profile") {
    return null;
  }

  return <>{children}</>;
}
