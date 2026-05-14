"use client";

import { useState } from "react";

import { bffUpdateProfile } from "@/features/account/infrastructure/account-api";
import { useAuth } from "@/features/auth/application/auth-context";
import { extractDetail } from "@/features/account/application/_extract-detail";
import type { UpdateProfilePayload } from "@/features/account/domain/types";

export function useUpdateProfile() {
  const { profileUpdateSuccess } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(payload: UpdateProfilePayload): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      const { user } = await bffUpdateProfile(payload);
      profileUpdateSuccess(user);
      return true;
    } catch (e: unknown) {
      setError(extractDetail(e, "Could not update profile."));
      return false;
    } finally {
      setLoading(false);
    }
  }

  return { submit, loading, error };
}
