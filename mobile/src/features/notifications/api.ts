import { apiClient } from '@/shared/api/client';
import { extractCursor, type CursorPaginatedResponse } from '@/shared/api/pagination';
import type { NotificationActor, NotificationItem, NotificationPage } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeActor(raw: unknown): NotificationActor | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.display_name !== 'string') {
    return null;
  }
  return {
    id: raw.id,
    display_name: raw.display_name,
    identify_tag: typeof raw.identify_tag === 'string' ? raw.identify_tag : null,
  };
}

export function normalizeNotification(raw: unknown): NotificationItem | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.length === 0) {
    return null;
  }
  return {
    id: raw.id,
    notification_type: typeof raw.notification_type === 'string' ? raw.notification_type : 'UNKNOWN',
    actor: normalizeActor(raw.actor),
    payload: raw.payload,
    is_read: typeof raw.is_read === 'boolean' ? raw.is_read : false,
    read_at: typeof raw.read_at === 'string' ? raw.read_at : null,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
  };
}

export async function listNotifications(cursor?: string | null): Promise<NotificationPage> {
  const { data } = await apiClient.get<CursorPaginatedResponse<unknown>>('/notifications/', {
    params: cursor ? { cursor } : undefined,
  });
  const rawResults = Array.isArray(data.results) ? data.results : [];
  const items = rawResults.flatMap((raw) => {
    const notification = normalizeNotification(raw);
    return notification ? [notification] : [];
  });
  return {
    items,
    nextCursor: extractCursor(typeof data.next === 'string' ? data.next : null),
  };
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<{ unread_count: unknown }>('/notifications/unread-count');
  if (typeof data.unread_count !== 'number' || !Number.isFinite(data.unread_count) || data.unread_count < 0) {
    throw new Error('Invalid unread notification count response.');
  }
  return Math.floor(data.unread_count);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await apiClient.post(`/notifications/${notificationId}/read`);
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data } = await apiClient.post<{ updated_count: number }>('/notifications/read-all');
  return typeof data.updated_count === 'number' ? data.updated_count : 0;
}

export async function acceptTripInvitation(invitationId: string): Promise<void> {
  await apiClient.post(`/invitations/${invitationId}/accept`);
}

export async function declineTripInvitation(invitationId: string): Promise<void> {
  await apiClient.post(`/invitations/${invitationId}/decline`);
}
