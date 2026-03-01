"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/application/auth-context";
import { Spinner } from "@/shared/ui/spinner";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
    if (status === "pending_profile") {
      router.replace("/setup-profile");
    }
  }, [status, router]);

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-indigo-600" />
      </div>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  return <>{children}</>;
}
