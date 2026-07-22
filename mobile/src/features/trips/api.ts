import { apiClient } from '@/shared/api/client';
import { extractCursor, type CursorPaginatedResponse } from '@/shared/api/pagination';
import type {
  CreateTripInput,
  Trip,
  TripDetailResponse,
  TripListItem,
  TripListPage,
  TripStatus,
  UpdateTripInput,
} from './types';

export async function listTrips(cursor?: string | null): Promise<TripListPage> {
  const { data } = await apiClient.get<CursorPaginatedResponse<TripListItem>>('/trips/', {
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

export async function updateTrip(tripId: string, input: UpdateTripInput): Promise<Trip> {
  const { data } = await apiClient.patch<{ trip: Trip }>(`/trips/${tripId}`, input);
  return data.trip;
}

interface TripStatusResponse {
  status: TripStatus;
}

async function postTripStatusAction(tripId: string, action: 'start' | 'complete' | 'cancel'): Promise<TripStatus> {
  const { data } = await apiClient.post<TripStatusResponse>(`/trips/${tripId}/${action}`);
  return data.status;
}

export function startTrip(tripId: string): Promise<TripStatus> {
  return postTripStatusAction(tripId, 'start');
}

export function completeTrip(tripId: string): Promise<TripStatus> {
  return postTripStatusAction(tripId, 'complete');
}

export function cancelTrip(tripId: string): Promise<TripStatus> {
  return postTripStatusAction(tripId, 'cancel');
}

export async function leaveTrip(tripId: string): Promise<void> {
  await apiClient.post(`/trips/${tripId}/leave`);
}
