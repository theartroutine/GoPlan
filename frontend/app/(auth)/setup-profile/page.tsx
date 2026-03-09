import { SetupProfileForm } from "@/features/auth/presentation/setup-profile-form";
import { PendingProfileGuard } from "@/features/auth/presentation/pending-profile-guard";

export default function SetupProfilePage() {
  return (
    <PendingProfileGuard>
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-2xl font-semibold text-foreground">
            Complete your profile
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Set up your name and identity to get started
          </p>

          <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
            <SetupProfileForm />
          </div>
        </div>
      </main>
    </PendingProfileGuard>
  );
}
