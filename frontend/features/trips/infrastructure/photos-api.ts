import type {
  TripPhoto,
  TripPhotoListResponse,
  TripPhotoPage,
  TripPhotoUploadResponse,
  TripPhotoVariant,
} from "@/features/trips/domain/photo-types";
import { bff } from "@/shared/http/bff-client";
import { throwWithParsedBlobJsonError } from "@/shared/http/api-errors";
import { parseContentDispositionFilename } from "@/features/trips/infrastructure/download-file";

export type TripPhotoDownload = {
  blob: Blob;
  filename: string;
};

const SINGLE_DOWNLOAD_FALLBACK_FILENAME = "photo.webp";
const BULK_DOWNLOAD_FALLBACK_FILENAME = "trip-photos.zip";

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

export async function bffDownloadTripPhoto(
  tripId: string,
  photoId: string,
): Promise<TripPhotoDownload> {
  try {
    const res = await bff.get<Blob>(
      `${tripPhotosPath(tripId)}/${encodeURIComponent(photoId)}/download`,
      { responseType: "blob" },
    );
    return {
      blob: res.data,
      filename: parseContentDispositionFilename(
        res.headers["content-disposition"],
        SINGLE_DOWNLOAD_FALLBACK_FILENAME,
      ),
    };
  } catch (error) {
    return throwWithParsedBlobJsonError(error);
  }
}

export async function bffDownloadTripPhotosZip(
  tripId: string,
  photoIds: string[],
): Promise<TripPhotoDownload> {
  try {
    const res = await bff.post<Blob>(
      `${tripPhotosPath(tripId)}/download`,
      { photo_ids: photoIds },
      { responseType: "blob" },
    );
    return {
      blob: res.data,
      filename: parseContentDispositionFilename(
        res.headers["content-disposition"],
        BULK_DOWNLOAD_FALLBACK_FILENAME,
      ),
    };
  } catch (error) {
    return throwWithParsedBlobJsonError(error);
  }
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
