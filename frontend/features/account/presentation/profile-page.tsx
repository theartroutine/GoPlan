"use client";

import { AvatarSection } from "@/features/account/presentation/avatar-section";
import { PersonalInfoSection } from "@/features/account/presentation/personal-info-section";
import { SecuritySection } from "@/features/account/presentation/security-section";

export function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 p-4 md:p-6">
      <h2 className="text-xl font-semibold">Profile</h2>
      <AvatarSection />
      <PersonalInfoSection />
      <SecuritySection />
    </div>
  );
}
