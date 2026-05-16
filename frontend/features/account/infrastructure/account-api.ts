import type { AuthUser } from "@/features/auth/domain/types";
import type {
  ChangePasswordPayload,
  UpdateProfilePayload,
} from "@/features/account/domain/types";
import { bff } from "@/shared/http/bff-client";

export type UserEnvelope = { user: AuthUser };
export type ChangePasswordResponse = UserEnvelope & { access_token: string };

export async function bffUpdateProfile(payload: UpdateProfilePayload): Promise<UserEnvelope> {
  const res = await bff.patch<UserEnvelope>("/api/auth/profile/name", payload);
  return res.data;
}

export async function bffUpdateAvatar(file: Blob): Promise<UserEnvelope> {
  const form = new FormData();
  form.append("avatar", file, "avatar.webp");
  const res = await bff.patchForm<UserEnvelope>("/api/auth/avatar", form);
  return res.data;
}

export async function bffDeleteAvatar(): Promise<UserEnvelope> {
  const res = await bff.delete<UserEnvelope>("/api/auth/avatar");
  return res.data;
}

export async function bffChangePassword(
  payload: ChangePasswordPayload,
): Promise<ChangePasswordResponse> {
  const res = await bff.post<ChangePasswordResponse>(
    "/api/auth/password/change",
    payload,
  );
  return res.data;
}
