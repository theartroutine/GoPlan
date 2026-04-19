import type { CreateTripPayload, CreateTripResponse, InvitableFriend, TripDetail, TripDetailResponse, TripInvitation, TripListResponse, UpdateTripPayload } from "@/features/trips/domain/types";
import { bff } from "@/shared/http/bff-client";
import { tokenManager } from "@/features/auth/infrastructure/token-manager";

export async function bffListTrips(): Promise<TripListResponse> {
  const res = await bff.get<TripListResponse>("/api/trips");
  return res.data;
}

export async function bffCreateTrip(payload: CreateTripPayload): Promise<CreateTripResponse> {
  const res = await bff.post<CreateTripResponse>("/api/trips", payload);
  return res.data;
}

export async function bffGetTrip(tripId: string): Promise<TripDetailResponse> {
  const res = await bff.get<TripDetailResponse>(`/api/trips/${tripId}`);
  return res.data;
}

export async function bffUpdateTrip(tripId: string, payload: UpdateTripPayload): Promise<{ trip: TripDetail }> {
  const res = await bff.patch<{ trip: TripDetail }>(`/api/trips/${tripId}`, payload);
  return res.data;
}

export async function bffGetInvitations(tripId: string): Promise<{ invitations: TripInvitation[] }> {
  const res = await bff.get<{ invitations: TripInvitation[] }>(`/api/trips/${tripId}/invitations`);
  return res.data;
}

export async function bffSendInvitations(tripId: string, inviteeIds: string[]): Promise<{ invitations: TripInvitation[] }> {
  const res = await bff.post<{ invitations: TripInvitation[] }>(`/api/trips/${tripId}/invitations`, { invitee_ids: inviteeIds });
  return res.data;
}

export async function bffGetInvitableFriends(tripId: string): Promise<{ users: InvitableFriend[] }> {
  const res = await bff.get<{ users: InvitableFriend[] }>(`/api/trips/${tripId}/invitations/invitable-friends`);
  return res.data;
}

export async function bffAcceptInvitation(invitationId: string): Promise<void> {
  await bff.post(`/api/invitations/${invitationId}/accept`);
}

export async function bffDeclineInvitation(invitationId: string): Promise<void> {
  await bff.post(`/api/invitations/${invitationId}/decline`);
}

export async function bffStartTrip(tripId: string): Promise<void> {
  await bff.post(`/api/trips/${tripId}/start`);
}

export async function bffCompleteTrip(tripId: string): Promise<void> {
  await bff.post(`/api/trips/${tripId}/complete`);
}

export async function bffCancelTrip(tripId: string): Promise<void> {
  await bff.post(`/api/trips/${tripId}/cancel`);
}

export async function bffRemoveMember(tripId: string, userId: string): Promise<void> {
  await bff.delete(`/api/trips/${tripId}/members/${userId}`);
}

export async function bffLeaveTrip(tripId: string): Promise<void> {
  await bff.post(`/api/trips/${tripId}/leave`);
}

export async function bffUploadTripCover(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const token = tokenManager.get();
  const res = await fetch("/api/trips/cover-upload", {
    method: "POST",
    // Do NOT set Content-Type — browser sets it with the multipart boundary automatically
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    throw new Error("Cover upload failed");
  }

  const data = (await res.json()) as { url: string };
  return data.url;
}
