import { Suspense } from "react";

import { ResetPasswordContent } from "./content";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold text-foreground">
          Reset your password
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Enter your new password below
        </p>

        <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
          <Suspense fallback={null}>
            <ResetPasswordContent />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
