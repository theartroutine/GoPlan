"use client";

import { useCallback, useState } from "react";

import { SetupProfileForm, type SetupProfileFields } from "@/features/auth/presentation/setup-profile-form";
import { ProfilePreviewCard } from "@/features/auth/presentation/profile-preview-card";
import { IdentifyNameExplainer } from "@/features/auth/presentation/identify-name-explainer";
import { PendingProfileGuard } from "@/features/auth/presentation/pending-profile-guard";
import { VerifiedBanner } from "@/features/auth/presentation/verified-banner";

export default function SetupProfilePage() {
  const [fields, setFields] = useState<SetupProfileFields>({
    firstName: "",
    lastName: "",
    identifyName: "",
  });

  const handleFieldsChange = useCallback((f: SetupProfileFields) => {
    setFields(f);
  }, []);

  return (
    <PendingProfileGuard>
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm lg:max-w-5xl">
          <h1 className="text-center text-2xl font-semibold text-foreground">
            Complete your profile
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Set up your name and identity to get started
          </p>

          <div className="mt-8 lg:grid lg:grid-cols-[1fr_384px_1fr] lg:gap-0">
            {/* Left: Preview card + connector (desktop only) */}
            <div className="hidden lg:flex lg:items-start lg:justify-end lg:pt-6">
              <div className="w-full max-w-[260px]">
                <ProfilePreviewCard
                  firstName={fields.firstName}
                  lastName={fields.lastName}
                  identifyName={fields.identifyName}
                />
              </div>
              {/* Left connector: horizontal trunk → vertical split → two branches */}
              <div className="relative flex w-6 shrink-0 items-start pt-6">
                {/* Horizontal trunk from card edge to mid-point */}
                <div className="absolute left-0 top-[4.5rem] h-0 w-3 border-t-2 border-dashed border-muted-foreground/30" />
                {/* Vertical segment connecting two branches */}
                <div className="absolute left-3 top-[3rem] h-[3rem] w-0 border-l-2 border-dashed border-muted-foreground/30" />
                {/* Top branch → First name */}
                <div className="absolute left-3 top-[3rem] h-0 w-3 border-t-2 border-dashed border-muted-foreground/30" />
                {/* Bottom branch → Last name */}
                <div className="absolute left-3 top-[6rem] h-0 w-3 border-t-2 border-dashed border-muted-foreground/30" />
              </div>
            </div>

            {/* Center: Form */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="space-y-4">
                <VerifiedBanner />
                <SetupProfileForm onFieldsChange={handleFieldsChange} />
              </div>
            </div>

            {/* Right: Connector + Explainer card (desktop only) */}
            <div className="hidden lg:flex lg:items-start lg:pt-6">
              {/* Right connector: single horizontal line → Identify name */}
              <div className="relative flex w-6 shrink-0 items-start pt-6">
                <div className="absolute left-0 top-[10.5rem] h-0 w-6 border-t-2 border-dashed border-amber-400/50 dark:border-amber-600/50" />
              </div>
              <div className="w-full max-w-[260px]">
                <IdentifyNameExplainer />
              </div>
            </div>
          </div>
        </div>
      </main>
    </PendingProfileGuard>
  );
}
