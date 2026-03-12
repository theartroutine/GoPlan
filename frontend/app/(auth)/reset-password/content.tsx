"use client";

import { useSearchParams } from "next/navigation";

import { ResetPasswordForm } from "@/features/auth/presentation/reset-password-form";

export function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid");
  const token = searchParams.get("token");

  return <ResetPasswordForm uid={uid} token={token} />;
}
