"use client";

import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";

import { bffPasswordResetConfirm } from "@/features/auth/infrastructure/auth-api";
import type { FieldErrors } from "@/features/auth/domain/types";
import { Button } from "@/shared/ui/button";
import { FormErrorBanner } from "@/shared/ui/form-error-banner";
import { FormField } from "@/shared/ui/form-field";
import { Spinner } from "@/shared/ui/spinner";

interface ResetPasswordFormProps {
  uid: string | null;
  token: string | null;
}

export function ResetPasswordForm({ uid, token }: ResetPasswordFormProps) {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isExpiredToken, setIsExpiredToken] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!uid || !token) return;

      setFieldErrors({});
      setError(null);
      setIsExpiredToken(false);

      if (password !== confirmPassword) {
        setFieldErrors({ confirm_password: ["Passwords do not match."] });
        return;
      }

      setLoading(true);

      try {
        await bffPasswordResetConfirm(uid, token, password);
        router.push("/login?reset=true");
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.data) {
          const errData = err.response.data;

          if (errData.error_code === "INVALID_OR_EXPIRED_TOKEN") {
            setError(errData.detail ?? "Invalid or expired reset link.");
            setIsExpiredToken(true);
            return;
          }

          if (Array.isArray(errData.password)) {
            setFieldErrors({ password: errData.password });
          } else if (typeof errData.detail === "string") {
            setError(errData.detail);
          } else {
            setError("Failed to reset password. Please try again.");
          }
        } else {
          setError("Unexpected network error.");
        }
      } finally {
        setLoading(false);
      }
    },
    [uid, token, password, confirmPassword, router],
  );

  if (!uid || !token) {
    return (
      <div className="space-y-4">
        <FormErrorBanner>
          Invalid password reset link. It may have expired or been used already.
        </FormErrorBanner>
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/forgot-password"
            className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
          >
            Request a new reset link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="space-y-2">
          <FormErrorBanner>{error}</FormErrorBanner>
          {isExpiredToken && (
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/forgot-password"
                className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
              >
                Request a new reset link
              </Link>
            </p>
          )}
        </div>
      )}

      <FormField
        id="reset-password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setFieldErrors({});
          setError(null);
        }}
        error={fieldErrors.password?.join(" ")}
      />

      <FormField
        id="reset-confirm-password"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={confirmPassword}
        onChange={(e) => {
          setConfirmPassword(e.target.value);
          setFieldErrors({});
          setError(null);
        }}
        error={fieldErrors.confirm_password?.join(" ")}
      />

      <Button type="submit" disabled={loading} className="w-full">
        {loading && <Spinner className="h-4 w-4" />}
        Reset password
      </Button>
    </form>
  );
}
