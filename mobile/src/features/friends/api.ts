import { apiClient } from '@/shared/api/client';
import {
  type CursorPage,
  type CursorPaginatedResponse,
  toCursorPage,
} from '@/shared/api/pagination';
import type {
  AcceptFriendRequestResult,
  Friend,
  FriendRequest,
  FriendUser,
} from './types';

interface FriendUserResponse {
  user: FriendUser | null;
}

interface FriendRequestResponse {
  friend_request: FriendRequest;
}

interface AcceptFriendRequestResponse {
  friendship: Friend;
  friend_request_id: string;
}

async function listFriendPage<T>(path: string, cursor?: string | null): Promise<CursorPage<T>> {
  const { data } = await apiClient.get<CursorPaginatedResponse<T>>(path, {
    params: cursor ? { cursor } : undefined,
  });
  return toCursorPage(data);
}

export function listFriends(cursor?: string | null): Promise<CursorPage<Friend>> {
  return listFriendPage('/friends/', cursor);
}

export async function searchFriendUser(
  query: string,
  signal?: AbortSignal,
): Promise<FriendUser | null> {
  const { data } = await apiClient.get<FriendUserResponse>('/friends/search', {
    params: { q: query },
    signal,
  });
  return data.user;
}

export async function sendFriendRequest(identifyTag: string): Promise<FriendRequest> {
  const { data } = await apiClient.post<FriendRequestResponse>('/friends/requests', {
    identify_tag: identifyTag,
  });
  return data.friend_request;
}

export function listIncomingFriendRequests(
  cursor?: string | null,
): Promise<CursorPage<FriendRequest>> {
  return listFriendPage('/friends/requests/incoming', cursor);
}

export function listOutgoingFriendRequests(
  cursor?: string | null,
): Promise<CursorPage<FriendRequest>> {
  return listFriendPage('/friends/requests/outgoing', cursor);
}

export async function acceptFriendRequest(id: string): Promise<AcceptFriendRequestResult> {
  const { data } = await apiClient.post<AcceptFriendRequestResponse>(
    `/friends/requests/${id}/accept`,
  );
  return {
    friendship: data.friendship,
    friendRequestId: data.friend_request_id,
  };
}

export async function declineFriendRequest(id: string): Promise<FriendRequest> {
  const { data } = await apiClient.post<FriendRequestResponse>(
    `/friends/requests/${id}/decline`,
  );
  return data.friend_request;
}

export async function cancelFriendRequest(id: string): Promise<FriendRequest> {
  const { data } = await apiClient.post<FriendRequestResponse>(
    `/friends/requests/${id}/cancel`,
  );
  return data.friend_request;
}

export async function removeFriend(friendshipId: string): Promise<void> {
  await apiClient.delete(`/friends/${friendshipId}`);
}
