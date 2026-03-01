"use client";

import { useCallback, useState, type FormEvent } from "react";
import axios from "axios";

import { useAuth } from "@/features/auth/application/auth-context";
import { bffRegister } from "@/features/auth/infrastructure/auth-api";
import type { FieldErrors } from "@/features/auth/domain/types";
import { FormField } from "@/shared/ui/form-field";
import { Spinner } from "@/shared/ui/spinner";

export function RegisterForm() {
  const { loginSuccess } = useAuth();

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
        loginSuccess(data.user, data.access_token);
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
    [email, password, loginSuccess],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {generalError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {generalError}
        </div>
      )}

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
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading && <Spinner className="h-4 w-4 text-white" />}
        Create account
      </button>
    </form>
  );
}
