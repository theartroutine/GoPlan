import axios from "axios";

import type { AuthUser } from "@/features/auth/domain/types";
import { tokenManager } from "@/features/auth/infrastructure/token-manager";
import type {
  ChangePasswordPayload,
  UpdateProfilePayload,
} from "@/features/account/domain/types";

const bff = axios.create({
  baseURL: "",
  timeout: 15_000,
  withCredentials: true,
});

function authHeaders(): Record<string, string> {
  const accessToken = tokenManager.get();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export type UserEnvelope = { user: AuthUser };
export type ChangePasswordResponse = UserEnvelope & { access_token: string };

export async function bffUpdateProfile(payload: UpdateProfilePayload): Promise<UserEnvelope> {
  const res = await bff.patch<UserEnvelope>("/api/auth/profile/name", payload, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  return res.data;
}

export async function bffUpdateAvatar(file: Blob): Promise<UserEnvelope> {
  const form = new FormData();
  form.append("avatar", file, "avatar.webp");
  const res = await bff.patch<UserEnvelope>("/api/auth/avatar", form, {
    headers: authHeaders(),
  });
  return res.data;
}

export async function bffDeleteAvatar(): Promise<UserEnvelope> {
  const res = await bff.delete<UserEnvelope>("/api/auth/avatar", {
    headers: authHeaders(),
  });
  return res.data;
}

export async function bffChangePassword(
  payload: ChangePasswordPayload,
): Promise<ChangePasswordResponse> {
  const res = await bff.post<ChangePasswordResponse>(
    "/api/auth/password/change",
    payload,
    { headers: { "Content-Type": "application/json", ...authHeaders() } },
  );
  return res.data;
}
