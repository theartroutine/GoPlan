import { apiClient } from '@/shared/api/client';
import type { AuthResponse, AuthUser } from './types';

export interface ProfileSetupInput {
  first_name: string;
  last_name: string;
  identify_name: string;
}

export async function loginRequest(email: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', { email, password });
  return data;
}

export async function registerRequest(email: string, password: string): Promise<{ detail: string }> {
  const { data } = await apiClient.post<{ detail: string }>('/auth/register', { email, password });
  return data;
}

export async function resendVerificationRequest(email: string): Promise<{ detail: string }> {
  const { data } = await apiClient.post<{ detail: string }>('/auth/resend-verification', { email });
  return data;
}

export async function logoutRequest(refresh: string): Promise<void> {
  await apiClient.post('/auth/logout', { refresh });
}

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await apiClient.get<{ user: AuthUser }>('/auth/me');
  return data.user;
}

export async function profileSetupRequest(input: ProfileSetupInput): Promise<AuthUser> {
  const { data } = await apiClient.post<{ user: AuthUser }>('/auth/profile/setup', input);
  return data.user;
}
