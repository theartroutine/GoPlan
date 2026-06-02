import type {
  CreateTripMemoryPayload,
  TripMemoryCreateOptionsResponse,
  TripMemoryListResponse,
  TripMemoryPage,
  TripMemoryResponse,
  TripMemoryShare,
  TripMemoryShareResponse,
  TripMemoryStatusResponse,
  TripMemoryVideo,
  UpdateTripMemoryPayload,
} from "@/features/trips/domain/memory-types";
import { bff } from "@/shared/http/bff-client";
import { throwWithParsedBlobJsonError } from "@/shared/http/api-errors";

type ListTripMemoriesOptions = {
  cursor?: string;
  pageSize?: number;
  signal?: AbortSignal;
};

type RequestOptions = {
  signal?: AbortSignal;
};

type TripMemoryAssetVariant = "poster" | "video";

type FetchTripMemoryAssetBlobOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

function tripMemoriesPath(tripId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/memories`;
}

function tripMemoryPath(tripId: string, memoryId: string): string {
  return `${tripMemoriesPath(tripId)}/${encodeURIComponent(memoryId)}`;
}

function tripMemoryAssetPath(
  tripId: string,
  memoryId: string,
  variant: TripMemoryAssetVariant,
): string {
  return `${tripMemoryPath(tripId, memoryId)}/${variant}`;
}

function tripMemoryStatusPath(tripId: string): string {
  return `${tripMemoriesPath(tripId)}/status`;
}

function tripMemoryCreateOptionsPath(tripId: string): string {
  return `${tripMemoriesPath(tripId)}/create-options`;
}

function extractCursor(url: string | null): string | null {
  if (!url) return null;

  try {
    return new URL(url, "http://localhost").searchParams.get("cursor");
  } catch {
    return null;
  }
}

function buildMemoryStatusParams(ids: string[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const id of ids) params.append("ids", id);
  return params;
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

export async function bffListTripMemoryStatuses(
  tripId: string,
  ids: string[],
  options: RequestOptions = {},
): Promise<TripMemoryStatusResponse> {
  const res = await bff.get<TripMemoryStatusResponse>(
    tripMemoryStatusPath(tripId),
    {
      params: buildMemoryStatusParams(ids),
      signal: options.signal,
    },
  );
  return res.data;
}

export async function bffGetTripMemoryCreateOptions(
  tripId: string,
  options: RequestOptions = {},
): Promise<TripMemoryCreateOptionsResponse> {
  const res = options.signal
    ? await bff.get<TripMemoryCreateOptionsResponse>(
      tripMemoryCreateOptionsPath(tripId),
      { signal: options.signal },
    )
    : await bff.get<TripMemoryCreateOptionsResponse>(
      tripMemoryCreateOptionsPath(tripId),
    );
  return res.data;
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

export async function bffFetchTripMemoryAssetBlob(
  tripId: string,
  memoryId: string,
  variant: TripMemoryAssetVariant,
  options: FetchTripMemoryAssetBlobOptions = {},
): Promise<Blob> {
  const requestConfig: {
    responseType: "blob";
    signal?: AbortSignal;
    timeout?: number;
  } = {
    responseType: "blob",
  };
  if (options.signal) requestConfig.signal = options.signal;
  if (options.timeoutMs) requestConfig.timeout = options.timeoutMs;

  try {
    const res = await bff.get<Blob>(
      tripMemoryAssetPath(tripId, memoryId, variant),
      requestConfig,
    );
    return res.data;
  } catch (error) {
    return throwWithParsedBlobJsonError(error);
  }
}
