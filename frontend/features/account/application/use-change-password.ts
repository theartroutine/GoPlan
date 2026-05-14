"use client";

import { useState } from "react";

import { bffChangePassword } from "@/features/account/infrastructure/account-api";
import { useAuth } from "@/features/auth/application/auth-context";
import { extractDetail } from "@/features/account/application/_extract-detail";
import type { ChangePasswordPayload } from "@/features/account/domain/types";

export function useChangePassword() {
  const { loginSuccess } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(payload: ChangePasswordPayload): Promise<boolean> {
    setSubmitting(true);
    setError(null);
    try {
      const { user, access_token } = await bffChangePassword(payload);
      loginSuccess(user, access_token);
      return true;
    } catch (e: unknown) {
      setError(extractDetail(e, "Could not change password."));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error };
}
