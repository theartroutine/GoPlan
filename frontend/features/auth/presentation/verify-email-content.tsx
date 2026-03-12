"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { Inbox, Mail } from "lucide-react";

import { useAuth } from "@/features/auth/application/auth-context";
import { bffResendVerification } from "@/features/auth/infrastructure/auth-api";
import { Button } from "@/shared/ui/button";
import { FormErrorBanner } from "@/shared/ui/form-error-banner";
import { FormSuccessBanner } from "@/shared/ui/form-success-banner";
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
    <div className="space-y-5">
      {error && <FormErrorBanner>{error}</FormErrorBanner>}

      {success && (
        <FormSuccessBanner>
          Verification email resent successfully.
        </FormSuccessBanner>
      )}

      {/* Hero: Mail icon with ring waves → dashed line → Inbox icon */}
      <div className="flex items-center justify-center gap-6">
        {/* Mail circle + ring waves */}
        <div className="relative flex items-center justify-center">
          <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <div className="absolute inset-0 m-auto h-14 w-14 rounded-full border-2 border-primary/30 animate-[ring-expand_2.4s_ease-out_infinite]" />
          <div className="absolute inset-0 m-auto h-14 w-14 rounded-full border-2 border-primary/30 animate-[ring-expand_2.4s_ease-out_0.8s_infinite]" />
          <div className="absolute inset-0 m-auto h-14 w-14 rounded-full border-2 border-primary/30 animate-[ring-expand_2.4s_ease-out_1.6s_infinite]" />
        </div>

        {/* Dashed connector */}
        <div className="w-10 border-t-2 border-dashed border-muted-foreground/30" />

        {/* Inbox circle */}
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Inbox className="h-7 w-7 text-muted-foreground" />
        </div>
      </div>

      {/* Email pill */}
      {email && (
        <div className="flex justify-center">
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {email}
          </span>
        </div>
      )}

      {/* Waiting text */}
      <p className="text-center text-sm font-medium text-foreground">
        Waiting for verification
        <span className="inline-flex w-6">
          <span className="animate-[ellipsis_1.4s_infinite]">.</span>
          <span className="animate-[ellipsis_1.4s_0.2s_infinite]">.</span>
          <span className="animate-[ellipsis_1.4s_0.4s_infinite]">.</span>
        </span>
      </p>

      {/* Resend row */}
      <div className="flex items-center justify-center gap-3">
        <span className="text-sm text-muted-foreground">Didn&apos;t get it?</span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResend}
          disabled={loading || !email}
        >
          {loading && <Spinner className="h-3.5 w-3.5" />}
          Resend
        </Button>
      </div>

    </div>
  );
}
