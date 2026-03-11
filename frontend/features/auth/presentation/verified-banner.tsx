"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { broadcastEmailVerified } from "@/features/auth/infrastructure/auth-channel";

export function VerifiedBanner() {
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "true";

  useEffect(() => {
    if (verified) {
      broadcastEmailVerified();
    }
  }, [verified]);

  if (!verified) return null;

  return (
    <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
      Email verified! Complete your profile to get started.
    </div>
  );
}
