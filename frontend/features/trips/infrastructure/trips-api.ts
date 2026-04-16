import type { CreateTripPayload, CreateTripResponse, InvitableFriend, TripDetail, TripDetailResponse, TripInvitation, TripListResponse, UpdateTripPayload } from "@/features/trips/domain/types";
import { bff } from "@/shared/http/bff-client";

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
