"use client";

import { useCallback, useState, type FormEvent } from "react";
import axios from "axios";

import { useAuth } from "@/features/auth/application/auth-context";
import { bffLogin } from "@/features/auth/infrastructure/auth-api";
import { FormField } from "@/shared/ui/form-field";
import { Spinner } from "@/shared/ui/spinner";

export function LoginForm() {
  const { loginSuccess } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);

      try {
        const data = await bffLogin(email, password);
        loginSuccess(data.user, data.access_token);
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const detail = err.response?.data?.detail;
          setError(typeof detail === "string" ? detail : "Login failed. Please try again.");
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
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <FormField
        id="login-email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <FormField
        id="login-password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading && <Spinner className="h-4 w-4 text-white" />}
        Sign in
      </button>
    </form>
  );
}
