"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { broadcastEmailVerified } from "@/features/auth/infrastructure/auth-channel";
import { FormSuccessBanner } from "@/shared/ui/form-success-banner";

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
    <FormSuccessBanner>
      Email verified! Complete your profile to get started.
    </FormSuccessBanner>
  );
}
