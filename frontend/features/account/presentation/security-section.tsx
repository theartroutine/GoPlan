"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { useChangePassword } from "@/features/account/application/use-change-password";
import { useAuth } from "@/features/auth/application/auth-context";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

const schema = z
  .object({
    current_password: z.string().min(1, "Required"),
    new_password: z.string().min(8, "At least 8 characters"),
    confirm_password: z.string().min(1, "Required"),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match",
  });

type FormValues = z.infer<typeof schema>;

function scoreStrength(pw: string): { label: string; pct: number } {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pw)) score += 1;
  const labels = ["Weak", "Weak", "Fair", "Good", "Strong", "Strong"];
  return { label: labels[score], pct: (score / 5) * 100 };
}

export function SecuritySection() {
  const { user } = useAuth();
  const { submit, submitting, error } = useChangePassword();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    control,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const newPassword = useWatch({ control, name: "new_password" }) ?? "";
  const strength = scoreStrength(newPassword);

  async function onSubmit(values: FormValues) {
    const ok = await submit({
      current_password: values.current_password,
      new_password: values.new_password,
    });
    if (ok) {
      reset();
      toast.success("Password updated. You've been signed out on other devices.");
    }
  }

  async function sendResetLink() {
    if (!user) return;
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      if (!response.ok) {
        let detail = "Could not send reset link.";
        try {
          const payload: unknown = await response.json();
          if (
            typeof payload === "object" &&
            payload !== null &&
            !Array.isArray(payload) &&
            typeof (payload as { detail?: unknown }).detail === "string"
          ) {
            detail = (payload as { detail: string }).detail;
          }
        } catch {
          // Keep the generic message when the server does not return JSON.
        }
        throw new Error(detail);
      }
      toast.success(`Reset link sent to ${user.email}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset link.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-base font-semibold">Security</h3>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="current_password">Current password</Label>
          <div className="relative">
            <Input
              id="current_password"
              type={showCurrent ? "text" : "password"}
              autoComplete="current-password"
              {...register("current_password")}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={showCurrent ? "Hide password" : "Show password"}
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.current_password && (
            <p className="mt-1 text-xs text-destructive">{errors.current_password.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="new_password">New password</Label>
          <div className="relative">
            <Input
              id="new_password"
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              {...register("new_password")}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? "Hide password" : "Show password"}
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.new_password && (
            <p className="mt-1 text-xs text-destructive">{errors.new_password.message}</p>
          )}
          {newPassword && (
            <div className="mt-1">
              <div className="h-1 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${strength.pct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Strength: {strength.label}</p>
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="confirm_password">Confirm new password</Label>
          <Input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            {...register("confirm_password")}
          />
          {errors.confirm_password && (
            <p className="mt-1 text-xs text-destructive">{errors.confirm_password.message}</p>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button type="submit" disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </Button>

        <p className="pt-2 text-xs text-muted-foreground">
          Don&rsquo;t remember current password?{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={sendResetLink}
          >
            Reset via email
          </button>
        </p>
      </form>
    </section>
  );
}
