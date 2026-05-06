"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

import { bffRegister } from "@/features/auth/infrastructure/auth-api";
import type { FieldErrors } from "@/features/auth/domain/types";
import { Button } from "@/shared/ui/button";
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

  const clearFieldError = useCallback((field: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setFieldErrors({});
      setGeneralError(null);
      setLoading(true);

      try {
        await bffRegister(email, password);
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.data) {
          const errData = err.response.data;

          // Check if response has field-level errors (object with arrays)
          const fields: FieldErrors = {};
          let hasFieldErrors = false;

          for (const [key, value] of Object.entries(errData)) {
            if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
              fields[key] = value;
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
        onChange={(e) => {
          setEmail(e.target.value);
          clearFieldError("email");
        }}
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
        onChange={(e) => {
          setPassword(e.target.value);
          clearFieldError("password");
        }}
        error={fieldErrors.password?.join(" ")}
      />

      <Button type="submit" disabled={loading} className="w-full">
        {loading && <Spinner className="h-4 w-4" />}
        Create account
      </Button>
    </form>
  );
}
