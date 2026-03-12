"use client";

import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import axios from "axios";

import { useAuth } from "@/features/auth/application/auth-context";
import { bffLogin } from "@/features/auth/infrastructure/auth-api";
import { Button } from "@/shared/ui/button";
import { FormErrorBanner } from "@/shared/ui/form-error-banner";
import { FormField } from "@/shared/ui/form-field";
import { FormSuccessBanner } from "@/shared/ui/form-success-banner";
import { Spinner } from "@/shared/ui/spinner";

export function LoginForm() {
  const { loginSuccess } = useAuth();
  const searchParams = useSearchParams();

  const verified = searchParams.get("verified") === "true";
  const reset = searchParams.get("reset") === "true";
  const verifyError = searchParams.get("verify_error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setEmailNotVerified(false);
      setLoading(true);

      try {
        const data = await bffLogin(email, password);
        loginSuccess(data.user, data.access_token);
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const errData = err.response?.data;
          if (errData?.error_code === "EMAIL_NOT_VERIFIED") {
            setEmailNotVerified(true);
          } else {
            const detail = errData?.detail;
            setError(typeof detail === "string" ? detail : "Login failed. Please try again.");
          }
        } else {
          setError("Unexpected network error.");
        }
      } finally {
        setLoading(false);
      }
    },
    [email, password, loginSuccess],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {verified && (
        <FormSuccessBanner>
          Email verified successfully! You can now sign in.
        </FormSuccessBanner>
      )}

      {reset && (
        <FormSuccessBanner>
          Password reset successfully! You can now sign in with your new password.
        </FormSuccessBanner>
      )}

      {verifyError === "invalid" && (
        <FormErrorBanner>
          Verification link is invalid or expired. Please request a new one.
        </FormErrorBanner>
      )}

      {emailNotVerified && (
        <FormErrorBanner>
          Please verify your email address before signing in.{" "}
          <Link
            href={`/verify-email?email=${encodeURIComponent(email)}`}
            className="font-medium underline underline-offset-2"
          >
            Resend verification email
          </Link>
        </FormErrorBanner>
      )}

      {error && <FormErrorBanner>{error}</FormErrorBanner>}

      <FormField
        id="login-email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setError(null);
          setEmailNotVerified(false);
        }}
      />

      <FormField
        id="login-password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setError(null);
          setEmailNotVerified(false);
        }}
      />

      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground/80"
        >
          Forgot password?
        </Link>
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading && <Spinner className="h-4 w-4" />}
        Sign in
      </Button>
    </form>
  );
}
