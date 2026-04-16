import type { CreateTripPayload, CreateTripResponse, TripListResponse } from "@/features/trips/domain/types";
import { bff } from "@/shared/http/bff-client";

export async function bffListTrips(): Promise<TripListResponse> {
  const res = await bff.get<TripListResponse>("/api/trips");
  return res.data;
}

export async function bffCreateTrip(payload: CreateTripPayload): Promise<CreateTripResponse> {
  const res = await bff.post<CreateTripResponse>("/api/trips", payload);
  return res.data;
}
