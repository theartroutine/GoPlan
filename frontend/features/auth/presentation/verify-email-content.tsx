"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";

import { bffResendVerification } from "@/features/auth/infrastructure/auth-api";
import { FormErrorBanner } from "@/shared/ui/form-error-banner";
import { Spinner } from "@/shared/ui/spinner";

export function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResend = useCallback(async () => {
    if (!email) return;
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      await bffResendVerification(email);
      setSuccess(true);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Failed to resend verification email.");
      } else {
        setError("Unexpected network error.");
      }
    } finally {
      setLoading(false);
    }
  }, [email]);

  return (
    <div className="space-y-4">
      {error && <FormErrorBanner>{error}</FormErrorBanner>}

      {success && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Verification email resent successfully.
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Click the link in the email we sent to{" "}
        {email ? (
          <span className="font-medium text-foreground">{email}</span>
        ) : (
          "your email address"
        )}{" "}
        to verify your account.
      </p>

      <p className="text-center text-xs text-muted-foreground">
        Didn&apos;t receive the email? Check your spam folder or resend it.
      </p>

      <button
        type="button"
        onClick={handleResend}
        disabled={loading || !email}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading && <Spinner className="h-4 w-4 text-primary-foreground" />}
        Resend verification email
      </button>
    </div>
  );
}
