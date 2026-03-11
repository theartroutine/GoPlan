import Link from "next/link";

import { VerifyEmailContent } from "@/features/auth/presentation/verify-email-content";
import { PublicAuthGuard } from "@/features/auth/presentation/public-auth-guard";

export default function VerifyEmailPage() {
  return (
    <PublicAuthGuard>
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-2xl font-semibold text-foreground">
            Check your inbox
          </h1>

          <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
            <VerifyEmailContent />
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link
              href="/login"
              className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </PublicAuthGuard>
  );
}
