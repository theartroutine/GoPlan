"use client";

import { useAuth } from "@/features/auth/application/auth-context";
import { AuthGuard } from "@/features/auth/presentation/auth-guard";
import { LogoutButton } from "@/features/auth/presentation/logout-button";
import { ProfileNameForm } from "@/features/auth/presentation/profile-name-form";

export default function Home() {
  return (
    <AuthGuard>
      <HomeContent />
    </AuthGuard>
  );
}

function HomeContent() {
  const { user } = useAuth();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Welcome to GoPlan</h1>
            <p className="mt-1 text-sm text-slate-600">
              Signed in as{" "}
              <span className="font-medium text-slate-900">
                {user?.display_name || user?.email}
              </span>
            </p>
          </div>
          <LogoutButton />
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-500">
            Your workspace is ready. Start planning your goals.
          </p>
        </div>
      </section>

      <section className="mx-auto mt-6 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold">Your Profile</h2>
        {user?.identify_tag && (
          <p className="mt-1 text-sm text-slate-500">{user.identify_tag}</p>
        )}

        <div className="mt-6">
          <ProfileNameForm
            initialFirstName={user?.first_name ?? ""}
            initialLastName={user?.last_name ?? ""}
          />
        </div>
      </section>
    </main>
  );
}
