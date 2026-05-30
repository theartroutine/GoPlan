import type {
  CreateTripMemoryPayload,
  MemoryMusicTracksResponse,
  MemoryMusicTrack,
  TripMemoryListResponse,
  TripMemoryPage,
  TripMemoryResponse,
  TripMemoryShare,
  TripMemoryShareResponse,
  TripMemoryVideo,
  UpdateTripMemoryPayload,
} from "@/features/trips/domain/memory-types";
import { bff } from "@/shared/http/bff-client";

type ListTripMemoriesOptions = {
  cursor?: string;
  pageSize?: number;
  signal?: AbortSignal;
};

type RequestOptions = {
  signal?: AbortSignal;
};

function tripMemoriesPath(tripId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/memories`;
}

function tripMemoryPath(tripId: string, memoryId: string): string {
  return `${tripMemoriesPath(tripId)}/${encodeURIComponent(memoryId)}`;
}

function extractCursor(url: string | null): string | null {
  if (!url) return null;

  try {
    return new URL(url, "http://localhost").searchParams.get("cursor");
  } catch {
    return null;
  }
}

export async function bffListTripMemories(
  tripId: string,
  options: ListTripMemoriesOptions = {},
): Promise<TripMemoryPage> {
  const params: Record<string, number | string> = {};
  if (options.cursor) params.cursor = options.cursor;
  if (options.pageSize) params.page_size = options.pageSize;

  const res = await bff.get<TripMemoryListResponse>(tripMemoriesPath(tripId), {
    params: Object.keys(params).length > 0 ? params : undefined,
    signal: options.signal,
  });

  return {
    results: res.data.results,
    nextCursor: extractCursor(res.data.next),
    previousCursor: extractCursor(res.data.previous),
  };
}

export async function bffCreateTripMemory(
  tripId: string,
  payload: CreateTripMemoryPayload,
): Promise<TripMemoryVideo> {
  const res = await bff.post<TripMemoryResponse>(tripMemoriesPath(tripId), payload);
  return res.data.memory;
}

export async function bffUpdateTripMemory(
  tripId: string,
  memoryId: string,
  payload: UpdateTripMemoryPayload,
): Promise<TripMemoryVideo> {
  const res = await bff.patch<TripMemoryResponse>(
    tripMemoryPath(tripId, memoryId),
    payload,
  );
  return res.data.memory;
}

export async function bffDeleteTripMemory(
  tripId: string,
  memoryId: string,
): Promise<void> {
  await bff.delete(tripMemoryPath(tripId, memoryId));
}

export async function bffEnableTripMemoryShareLink(
  tripId: string,
  memoryId: string,
): Promise<TripMemoryShare> {
  const res = await bff.post<TripMemoryShareResponse>(
    `${tripMemoryPath(tripId, memoryId)}/share-link`,
  );
  return res.data.share;
}

export async function bffDisableTripMemoryShareLink(
  tripId: string,
  memoryId: string,
): Promise<TripMemoryShare> {
  const res = await bff.delete<TripMemoryShareResponse>(
    `${tripMemoryPath(tripId, memoryId)}/share-link`,
  );
  return res.data.share;
}

export async function bffListMemoryMusicTracks(
  tripId: string,
  options: RequestOptions = {},
): Promise<MemoryMusicTrack[]> {
  const path = `${tripMemoriesPath(tripId)}/music-tracks`;
  const res = options.signal
    ? await bff.get<MemoryMusicTracksResponse>(path, { signal: options.signal })
    : await bff.get<MemoryMusicTracksResponse>(path);
  return res.data.tracks;
}
