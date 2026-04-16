import type { CreateTripPayload, CreateTripResponse, TripDetail, TripDetailResponse, TripListResponse, UpdateTripPayload } from "@/features/trips/domain/types";
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
