import type { CreateTripPayload, CreateTripResponse, InvitableFriend, TimelineResponse, TripDetail, TripDetailResponse, TripInvitation, TripListResponse, UpdateTripPayload } from "@/features/trips/domain/types";
import { bff } from "@/shared/http/bff-client";

export async function bffListTrips(cursor?: string): Promise<TripListResponse> {
  const res = await bff.get<TripListResponse>("/api/trips", {
    params: cursor ? { cursor } : undefined,
  });
  return res.data;
}

export async function bffCreateTrip(payload: CreateTripPayload): Promise<CreateTripResponse> {
  const res = await bff.post<CreateTripResponse>("/api/trips", payload);
  return res.data;
}

export async function bffGetTrip(tripId: string, signal?: AbortSignal): Promise<TripDetailResponse> {
  const res = await bff.get<TripDetailResponse>(`/api/trips/${tripId}`, { signal });
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

export async function bffGetTimeline(tripId: string, signal?: AbortSignal): Promise<TimelineResponse> {
  const res = await bff.get<TimelineResponse>(`/api/trips/${tripId}/timeline`, { signal });
  return res.data;
}

export async function bffUploadTripCover(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  // Use bff.postForm so axios sets Content-Type: multipart/form-data, overriding
  // the instance default of application/json. The XHR adapter then removes the
  // header and lets the browser attach the correct multipart boundary.
  // Using bff also ensures the rolling X-Access-Token response header is captured.
  const res = await bff.postForm<{ url: string }>("/api/trips/cover-upload", formData);
  return res.data.url;
}
