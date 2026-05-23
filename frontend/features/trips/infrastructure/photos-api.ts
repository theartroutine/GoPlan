import type {
  TripPhoto,
  TripPhotoListResponse,
  TripPhotoPage,
  TripPhotoUploadResponse,
  TripPhotoVariant,
} from "@/features/trips/domain/photo-types";
import { bff } from "@/shared/http/bff-client";

type ListTripPhotosOptions = {
  cursor?: string;
  signal?: AbortSignal;
};

function tripPhotosPath(tripId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/photos`;
}

function extractCursor(url: string | null): string | null {
  if (!url) return null;

  try {
    return new URL(url, "http://localhost").searchParams.get("cursor");
  } catch {
    return null;
  }
}

export function getTripPhotoAssetUrl(
  tripId: string,
  photoId: string,
  variant: TripPhotoVariant,
): string {
  return `${tripPhotosPath(tripId)}/${encodeURIComponent(photoId)}/${variant}`;
}

export async function bffListTripPhotos(
  tripId: string,
  options: ListTripPhotosOptions = {},
): Promise<TripPhotoPage> {
  const res = await bff.get<TripPhotoListResponse>(tripPhotosPath(tripId), {
    params: options.cursor ? { cursor: options.cursor } : undefined,
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
