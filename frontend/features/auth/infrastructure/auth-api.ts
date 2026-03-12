import axios from "axios";

import type { AuthUser, BffAuthResponse, BffRegisterResponse } from "@/features/auth/domain/types";
import { tokenManager } from "@/features/auth/infrastructure/token-manager";

const bff = axios.create({
  baseURL: "",
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

export async function bffLogin(email: string, password: string): Promise<BffAuthResponse> {
  const res = await bff.post<BffAuthResponse>("/api/auth/login", { email, password });
  return res.data;
}

export async function bffRegister(email: string, password: string): Promise<BffRegisterResponse> {
  const res = await bff.post<BffRegisterResponse>("/api/auth/register", { email, password });
  return res.data;
}

export async function bffResendVerification(email: string): Promise<{ detail: string }> {
  const res = await bff.post<{ detail: string }>("/api/auth/resend-verification", { email });
  return res.data;
}

export async function bffLogout(): Promise<void> {
  const accessToken = tokenManager.get();
  await bff.post("/api/auth/logout", null, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
}

export async function bffMe(): Promise<BffAuthResponse> {
  const res = await bff.get<BffAuthResponse>("/api/auth/me");
  return res.data;
}

type ProfileResponse = { user: AuthUser };

export async function bffProfileSetup(
  data: { first_name: string; last_name: string; identify_name: string },
): Promise<ProfileResponse> {
  const accessToken = tokenManager.get();
  const res = await bff.post<ProfileResponse>("/api/auth/profile/setup", data, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data;
}

export async function bffProfileNameUpdate(
  data: { first_name: string; last_name: string },
): Promise<ProfileResponse> {
  const accessToken = tokenManager.get();
  const res = await bff.patch<ProfileResponse>("/api/auth/profile/name", data, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data;
}
