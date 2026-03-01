import Link from "next/link";

import { RegisterForm } from "@/features/auth/presentation/register-form";
import { PublicAuthGuard } from "@/features/auth/presentation/public-auth-guard";

export default function RegisterPage() {
  return (
    <PublicAuthGuard>
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-2xl font-semibold text-slate-900">
            Create your account
          </h1>
          <p className="mt-2 text-center text-sm text-slate-600">
            Get started with GoPlan
          </p>

          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <RegisterForm />
          </div>

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </PublicAuthGuard>
  );
}
