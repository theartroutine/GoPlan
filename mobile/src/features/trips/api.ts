import { apiClient } from '@/shared/api/client';
import type { CreateTripInput, Trip, TripDetailResponse, TripListItem, TripListPage } from './types';

interface CursorPaginatedResponse {
  next: string | null;
  previous: string | null;
  results: TripListItem[];
}

// DRF CursorPagination returns absolute URLs; the client only needs the cursor value.
export function extractCursor(url: string | null): string | null {
  if (!url) {
    return null;
  }
  const match = /[?&]cursor=([^&]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function listTrips(cursor?: string | null): Promise<TripListPage> {
  const { data } = await apiClient.get<CursorPaginatedResponse>('/trips/', {
    params: cursor ? { cursor } : undefined,
  });
  return { items: data.results, nextCursor: extractCursor(data.next) };
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const { data } = await apiClient.post<{ trip: Trip }>('/trips/', input);
  return data.trip;
}

export async function getTripDetail(tripId: string): Promise<TripDetailResponse> {
  const { data } = await apiClient.get<TripDetailResponse>(`/trips/${tripId}`);
  return data;
}
