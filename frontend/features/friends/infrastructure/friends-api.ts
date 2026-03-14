import axios from "axios";

import type {
  Friend,
  FriendRequest,
  FriendUser,
  PaginatedResponse,
} from "@/features/friends/domain/types";
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

export async function bffFriendList(
  limit = 20,
  offset = 0,
): Promise<PaginatedResponse<Friend>> {
  const res = await bff.get<PaginatedResponse<Friend>>("/api/friends", {
    params: { limit, offset },
  });
  return res.data;
}

export async function bffIncomingRequests(
  limit = 20,
  offset = 0,
): Promise<PaginatedResponse<FriendRequest>> {
  const res = await bff.get<PaginatedResponse<FriendRequest>>(
    "/api/friends/requests/incoming",
    { params: { limit, offset } },
  );
  return res.data;
}

export async function bffOutgoingRequests(
  limit = 20,
  offset = 0,
): Promise<PaginatedResponse<FriendRequest>> {
  const res = await bff.get<PaginatedResponse<FriendRequest>>(
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
): Promise<{ user: FriendUser | null }> {
  const res = await bff.get<{ user: FriendUser | null }>(
    "/api/friends/search",
    { params: { q: query } },
  );
  return res.data;
}
