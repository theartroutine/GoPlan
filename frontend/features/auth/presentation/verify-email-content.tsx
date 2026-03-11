"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { Mail } from "lucide-react";

import { useAuth } from "@/features/auth/application/auth-context";
import { bffResendVerification } from "@/features/auth/infrastructure/auth-api";
import { FormErrorBanner } from "@/shared/ui/form-error-banner";
import { Spinner } from "@/shared/ui/spinner";

export function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const { status } = useAuth();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fallback: re-bootstrap when user returns to this tab
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && status === "unauthenticated") {
        window.location.reload();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [status]);

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
    <div className="space-y-6">
      {error && <FormErrorBanner>{error}</FormErrorBanner>}

      {success && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Verification email resent successfully.
        </div>
      )}

      {/* Animated email icon */}
      <div className="flex justify-center">
        <div className="animate-pulse rounded-full bg-primary/10 p-4">
          <Mail className="h-8 w-8 text-primary" />
        </div>
      </div>

      {/* Waiting text */}
      <p className="text-center text-sm font-medium text-foreground">
        Waiting for verification
        <span className="inline-flex w-6">
          <span className="animate-[ellipsis_1.4s_infinite]">...</span>
        </span>
      </p>

      <p className="text-center text-sm text-muted-foreground">
        We sent a verification link to{" "}
        {email ? (
          <span className="font-medium text-foreground">{email}</span>
        ) : (
          "your email address"
        )}
      </p>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
          Check inbox
        </span>
        <span className="h-px w-4 bg-border" />
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">2</span>
          Click link
        </span>
        <span className="h-px w-4 bg-border" />
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">3</span>
          Done
        </span>
      </div>

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
