import Link from "next/link";

import { RegisterForm } from "@/features/auth/presentation/register-form";
import { PublicAuthGuard } from "@/features/auth/presentation/public-auth-guard";

export default function RegisterPage() {
  return (
    <PublicAuthGuard>
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-2xl font-semibold text-foreground">
            Create your account
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Get started with GoPlan
          </p>

          <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
            <RegisterForm />
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
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
