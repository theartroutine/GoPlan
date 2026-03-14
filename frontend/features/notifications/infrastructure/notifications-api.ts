import axios from "axios";

import type { NotificationListResponse } from "@/features/notifications/domain/types";
import { tokenManager } from "@/features/auth/infrastructure/token-manager";

const bff = axios.create({
  baseURL: "",
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

bff.interceptors.request.use((config) => {
  const token = tokenManager.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

bff.interceptors.response.use((response) => {
  const newToken = response.headers["x-access-token"];
  if (typeof newToken === "string" && newToken.length > 0) {
    tokenManager.set(newToken);
  }
  return response;
});

export async function bffNotificationsList(
  cursor?: string,
): Promise<NotificationListResponse> {
  const params = cursor ? { cursor } : undefined;
  const res = await bff.get<NotificationListResponse>("/api/notifications", {
    params,
  });
  return res.data;
}

export async function bffUnreadCount(): Promise<{ unread_count: number }> {
  const res = await bff.get<{ unread_count: number }>(
    "/api/notifications/unread-count",
  );
  return res.data;
}

export async function bffMarkRead(id: string): Promise<void> {
  await bff.post(`/api/notifications/${id}/read`);
}

export async function bffMarkAllRead(): Promise<{ updated_count: number }> {
  const res = await bff.post<{ updated_count: number }>(
    "/api/notifications/read-all",
  );
  return res.data;
}
