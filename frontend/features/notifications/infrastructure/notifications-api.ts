import type { NotificationListResponse } from "@/features/notifications/domain/types";
import { bff } from "@/shared/http/bff-client";

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
