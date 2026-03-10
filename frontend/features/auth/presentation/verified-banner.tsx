"use client";

import { useSearchParams } from "next/navigation";

export function VerifiedBanner() {
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "true";

  if (!verified) return null;

  return (
    <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
      Email verified! Complete your profile to get started.
    </div>
  );
}
