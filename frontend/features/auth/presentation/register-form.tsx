"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

import { bffRegister } from "@/features/auth/infrastructure/auth-api";
import type { FieldErrors } from "@/features/auth/domain/types";
import { FormErrorBanner } from "@/shared/ui/form-error-banner";
import { FormField } from "@/shared/ui/form-field";
import { Spinner } from "@/shared/ui/spinner";

export function RegisterForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setFieldErrors({});
      setGeneralError(null);
      setLoading(true);

      try {
        const data = await bffRegister(email, password);
        router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.data) {
          const errData = err.response.data;

          // Check if response has field-level errors (object with arrays)
          const fields: FieldErrors = {};
          let hasFieldErrors = false;

          for (const [key, value] of Object.entries(errData)) {
            if (Array.isArray(value)) {
              fields[key] = value as string[];
              hasFieldErrors = true;
            }
          }

          if (hasFieldErrors) {
            setFieldErrors(fields);
          } else if (typeof errData.detail === "string") {
            setGeneralError(errData.detail);
          } else {
            setGeneralError("Registration failed. Please try again.");
          }
        } else {
          setGeneralError("Unexpected network error.");
        }
      } finally {
        setLoading(false);
      }
    },
    [email, password, router],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {generalError && <FormErrorBanner>{generalError}</FormErrorBanner>}

      <FormField
        id="register-email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email?.join(" ")}
      />

      <FormField
        id="register-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password?.join(" ")}
      />

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading && <Spinner className="h-4 w-4 text-primary-foreground" />}
        Create account
      </button>
    </form>
  );
}
