import type {
  CountPaginatedResponse,
  Friend,
  FriendRequest,
  FriendUser,
  PaginatedResponse,
} from "@/features/friends/domain/types";
import { bff } from "@/shared/http/bff-client";

export async function bffFriendList(
  cursor?: string,
): Promise<PaginatedResponse<Friend>> {
  const res = await bff.get<PaginatedResponse<Friend>>("/api/friends", {
    params: cursor ? { cursor } : undefined,
  });
  return res.data;
}

export async function bffIncomingRequests(
  limit = 20,
  offset = 0,
): Promise<CountPaginatedResponse<FriendRequest>> {
  const res = await bff.get<CountPaginatedResponse<FriendRequest>>(
    "/api/friends/requests/incoming",
    { params: { limit, offset } },
  );
  return res.data;
}

export async function bffOutgoingRequests(
  limit = 20,
  offset = 0,
): Promise<CountPaginatedResponse<FriendRequest>> {
  const res = await bff.get<CountPaginatedResponse<FriendRequest>>(
    "/api/friends/requests/outgoing",
    { params: { limit, offset } },
  );
  return res.data;
}

export async function bffSendRequest(
  identifyTag: string,
): Promise<{ friend_request: FriendRequest }> {
  const res = await bff.post<{ friend_request: FriendRequest }>(
    "/api/friends/requests",
    { identify_tag: identifyTag },
  );
  return res.data;
}

export async function bffAcceptRequest(
  id: string,
): Promise<{ friendship: Friend; friend_request_id: string }> {
  const res = await bff.post<{
    friendship: Friend;
    friend_request_id: string;
  }>(`/api/friends/requests/${id}/accept`);
  return res.data;
}

export async function bffDeclineRequest(
  id: string,
): Promise<{ friend_request: FriendRequest }> {
  const res = await bff.post<{ friend_request: FriendRequest }>(
    `/api/friends/requests/${id}/decline`,
  );
  return res.data;
}

export async function bffCancelRequest(
  id: string,
): Promise<{ friend_request: FriendRequest }> {
  const res = await bff.post<{ friend_request: FriendRequest }>(
    `/api/friends/requests/${id}/cancel`,
  );
  return res.data;
}

export async function bffRemoveFriend(id: string): Promise<void> {
  await bff.delete(`/api/friends/${id}`);
}

export async function bffSearchUser(
  query: string,
  signal?: AbortSignal,
): Promise<{ user: FriendUser | null }> {
  const res = await bff.get<{ user: FriendUser | null }>(
    "/api/friends/search",
    { params: { q: query }, signal },
  );
  return res.data;
}
