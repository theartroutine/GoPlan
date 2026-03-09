import Link from "next/link";

import { LoginForm } from "@/features/auth/presentation/login-form";
import { PublicAuthGuard } from "@/features/auth/presentation/public-auth-guard";

export default function LoginPage() {
  return (
    <PublicAuthGuard>
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-2xl font-semibold text-foreground">
            Sign in to GoPlan
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Enter your credentials to continue
          </p>

          <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
            <LoginForm />
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
            >
              Create one
            </Link>
          </p>
        </div>
      </main>
    </PublicAuthGuard>
  );
}
