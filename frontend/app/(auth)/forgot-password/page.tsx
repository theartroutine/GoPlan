import Link from "next/link";

import { ForgotPasswordForm } from "@/features/auth/presentation/forgot-password-form";
import { PublicAuthGuard } from "@/features/auth/presentation/public-auth-guard";

export default function ForgotPasswordPage() {
  return (
    <PublicAuthGuard>
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-2xl font-semibold text-foreground">
            Forgot your password?
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link
          </p>

          <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
            <ForgotPasswordForm />
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Remember your password?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
            >
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </PublicAuthGuard>
  );
}
