"use client";

import { useState } from "react";

import {
  bffDeleteAvatar,
  bffUpdateAvatar,
} from "@/features/account/infrastructure/account-api";
import { useAuth } from "@/features/auth/application/auth-context";
import { extractDetail } from "@/features/account/application/_extract-detail";

export function useUpdateAvatar() {
  const { profileUpdateSuccess } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(blob: Blob): Promise<boolean> {
    setUploading(true);
    setError(null);
    try {
      const { user } = await bffUpdateAvatar(blob);
      profileUpdateSuccess(user);
      return true;
    } catch (e: unknown) {
      setError(extractDetail(e, "Could not upload avatar."));
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function remove(): Promise<boolean> {
    setUploading(true);
    setError(null);
    try {
      const { user } = await bffDeleteAvatar();
      profileUpdateSuccess(user);
      return true;
    } catch (e: unknown) {
      setError(extractDetail(e, "Could not remove avatar."));
      return false;
    } finally {
      setUploading(false);
    }
  }

  return { upload, remove, uploading, error };
}
