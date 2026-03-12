"use client";

import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import axios from "axios";

import { bffPasswordResetRequest } from "@/features/auth/infrastructure/auth-api";
import { Button } from "@/shared/ui/button";
import { FormErrorBanner } from "@/shared/ui/form-error-banner";
import { FormField } from "@/shared/ui/form-field";
import { FormSuccessBanner } from "@/shared/ui/form-success-banner";
import { Spinner } from "@/shared/ui/spinner";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(false);
      setLoading(true);

      try {
        await bffPasswordResetRequest(email);
        setSuccess(true);
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const detail = err.response?.data?.detail;
          setError(typeof detail === "string" ? detail : "Failed to send reset email. Please try again.");
        } else {
          setError("Unexpected network error.");
        }
      } finally {
        setLoading(false);
      }
    },
    [email],
  );

  if (success) {
    return (
      <div className="space-y-4">
        <FormSuccessBanner>
          If an account exists with that email, a password reset link has been sent. Please check your inbox.
        </FormSuccessBanner>
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <FormErrorBanner>{error}</FormErrorBanner>}

      <FormField
        id="forgot-email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setError(null);
        }}
      />

      <Button type="submit" disabled={loading} className="w-full">
        {loading && <Spinner className="h-4 w-4" />}
        Send reset link
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
