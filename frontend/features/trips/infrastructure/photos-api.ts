import type {
  TripPhoto,
  TripPhotoListResponse,
  TripPhotoPage,
  TripPhotoUploadResponse,
  TripPhotoVariant,
} from "@/features/trips/domain/photo-types";
import { bff } from "@/shared/http/bff-client";
import { throwWithParsedBlobJsonError } from "@/shared/http/api-errors";

type ListTripPhotosOptions = {
  cursor?: string;
  pageSize?: number;
  signal?: AbortSignal;
};

type FetchTripPhotoAssetBlobOptions = {
  signal?: AbortSignal;
};

function tripPhotosPath(tripId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/photos`;
}

function tripPhotoAssetPath(
  tripId: string,
  photoId: string,
  variant: TripPhotoVariant,
): string {
  return `${tripPhotosPath(tripId)}/${encodeURIComponent(photoId)}/${variant}`;
}

function extractCursor(url: string | null): string | null {
  if (!url) return null;

  try {
    return new URL(url, "http://localhost").searchParams.get("cursor");
  } catch {
    return null;
  }
}

export async function bffListTripPhotos(
  tripId: string,
  options: ListTripPhotosOptions = {},
): Promise<TripPhotoPage> {
  const params: Record<string, number | string> = {};
  if (options.cursor) params.cursor = options.cursor;
  if (options.pageSize) params.page_size = options.pageSize;
  const res = await bff.get<TripPhotoListResponse>(tripPhotosPath(tripId), {
    params: Object.keys(params).length > 0 ? params : undefined,
    signal: options.signal,
  });
  return {
    results: res.data.results,
    nextCursor: extractCursor(res.data.next),
    previousCursor: extractCursor(res.data.previous),
  };
}

export async function bffUploadTripPhotos(
  tripId: string,
  files: File[],
): Promise<TripPhoto[]> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  const res = await bff.postForm<TripPhotoUploadResponse>(tripPhotosPath(tripId), form);
  return res.data.photos;
}

export async function bffDeleteTripPhoto(
  tripId: string,
  photoId: string,
): Promise<void> {
  await bff.delete(`${tripPhotosPath(tripId)}/${encodeURIComponent(photoId)}`);
}

export async function bffFetchTripPhotoAssetBlob(
  tripId: string,
  photoId: string,
  variant: TripPhotoVariant,
  options: FetchTripPhotoAssetBlobOptions = {},
): Promise<Blob> {
  try {
    const res = await bff.get<Blob>(tripPhotoAssetPath(tripId, photoId, variant), {
      responseType: "blob",
      signal: options.signal,
    });
    return res.data;
  } catch (error) {
    return throwWithParsedBlobJsonError(error);
  }
}
