"use client";

/* eslint-disable @next/next/no-img-element -- Blob object URLs cannot be optimized by next/image. */

import { ImageIcon, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TripPhoto } from "@/features/trips/domain/photo-types";
import { getTripPhotoErrorMessage } from "@/features/trips/domain/photo-errors";
import {
  bffFetchTripPhotoAssetBlob,
  bffListTripPhotos,
} from "@/features/trips/infrastructure/photos-api";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

type MemoryPhotoPickerProps = {
  disabled?: boolean;
  selectedIds: string[];
  tripId: string;
  onSelectionChange: (ids: string[]) => void;
};

const LOAD_ERROR = "Could not load trip photos.";
const PHOTO_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
});

function photoAlt(photo: TripPhoto): string {
  return `Trip photo uploaded by ${photo.uploaded_by.display_name}`;
}

function formatPhotoDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Uploaded photo";
  return PHOTO_DATE_FORMATTER.format(date);
}

export function MemoryPhotoPicker({
  disabled = false,
  selectedIds,
  tripId,
  onSelectionChange,
}: MemoryPhotoPickerProps) {
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [thumbnailErrors, setThumbnailErrors] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thumbnailUrlsRef = useRef<Map<string, string>>(new Map());
  const thumbnailErrorsRef = useRef<Set<string>>(new Set());
  const thumbnailRequestsRef = useRef<Map<string, AbortController>>(new Map());
  const visiblePhotoIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(false);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedOrderById = useMemo(
    () => new Map(selectedIds.map((id, index) => [id, index + 1])),
    [selectedIds],
  );

  const syncThumbnailUrls = useCallback(() => {
    setThumbnailUrls(Object.fromEntries(thumbnailUrlsRef.current.entries()));
  }, []);

  const syncThumbnailErrors = useCallback(() => {
    setThumbnailErrors(new Set(thumbnailErrorsRef.current));
  }, []);

  const loadPhotos = useCallback(async (
    options: {
      append?: boolean;
      cursor?: string | null;
      signal?: AbortSignal;
    } = {},
  ) => {
    if (options.append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const page = await bffListTripPhotos(tripId, {
        cursor: options.cursor ?? undefined,
        pageSize: 50,
        signal: options.signal,
      });
      if (options.signal?.aborted) return;
      setPhotos((current) => {
        if (!options.append) return page.results;

        const seen = new Set(current.map((photo) => photo.id));
        return [
          ...current,
          ...page.results.filter((photo) => {
            if (seen.has(photo.id)) return false;
            seen.add(photo.id);
            return true;
          }),
        ];
      });
      setNextCursor(page.nextCursor);
    } catch (err) {
      if (!options.signal?.aborted) {
        setError(getTripPhotoErrorMessage(err, LOAD_ERROR));
        if (!options.append) setPhotos([]);
      }
    } finally {
      if (!options.signal?.aborted) {
        if (options.append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    }
  }, [tripId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadPhotos({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [loadPhotos]);

  useEffect(() => {
    mountedRef.current = true;
    const thumbnailRequests = thumbnailRequestsRef.current;
    const thumbnailObjectUrls = thumbnailUrlsRef.current;
    const thumbnailErrorsByPhoto = thumbnailErrorsRef.current;

    return () => {
      mountedRef.current = false;
      for (const controller of thumbnailRequests.values()) {
        controller.abort();
      }
      thumbnailRequests.clear();
      for (const url of thumbnailObjectUrls.values()) {
        URL.revokeObjectURL(url);
      }
      thumbnailObjectUrls.clear();
      thumbnailErrorsByPhoto.clear();
    };
  }, []);

  useEffect(() => {
    for (const controller of thumbnailRequestsRef.current.values()) {
      controller.abort();
    }
    thumbnailRequestsRef.current.clear();
    for (const url of thumbnailUrlsRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    thumbnailUrlsRef.current.clear();
    thumbnailErrorsRef.current.clear();
    visiblePhotoIdsRef.current = new Set();
    setThumbnailUrls({});
    setThumbnailErrors(new Set());
  }, [tripId]);

  useEffect(() => {
    const visibleIds = new Set(photos.map((photo) => photo.id));
    visiblePhotoIdsRef.current = visibleIds;

    let urlsChanged = false;
    let errorsChanged = false;
    for (const [photoId, url] of thumbnailUrlsRef.current.entries()) {
      if (!visibleIds.has(photoId)) {
        URL.revokeObjectURL(url);
        thumbnailUrlsRef.current.delete(photoId);
        urlsChanged = true;
      }
    }
    for (const [photoId, controller] of thumbnailRequestsRef.current.entries()) {
      if (!visibleIds.has(photoId)) {
        controller.abort();
        thumbnailRequestsRef.current.delete(photoId);
      }
    }
    for (const photoId of thumbnailErrorsRef.current) {
      if (!visibleIds.has(photoId)) {
        thumbnailErrorsRef.current.delete(photoId);
        errorsChanged = true;
      }
    }
    if (urlsChanged) syncThumbnailUrls();
    if (errorsChanged) syncThumbnailErrors();

    for (const photo of photos) {
      if (
        thumbnailUrlsRef.current.has(photo.id) ||
        thumbnailRequestsRef.current.has(photo.id) ||
        thumbnailErrorsRef.current.has(photo.id)
      ) {
        continue;
      }

      const controller = new AbortController();
      thumbnailRequestsRef.current.set(photo.id, controller);
      void bffFetchTripPhotoAssetBlob(tripId, photo.id, "thumbnail", {
        signal: controller.signal,
      })
        .then((blob) => {
          if (
            controller.signal.aborted ||
            !mountedRef.current ||
            !visiblePhotoIdsRef.current.has(photo.id)
          ) {
            return;
          }

          const objectUrl = URL.createObjectURL(blob);
          const previousUrl = thumbnailUrlsRef.current.get(photo.id);
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          thumbnailUrlsRef.current.set(photo.id, objectUrl);
          syncThumbnailUrls();
        })
        .catch(() => {
          if (
            !controller.signal.aborted &&
            mountedRef.current &&
            visiblePhotoIdsRef.current.has(photo.id)
          ) {
            thumbnailErrorsRef.current.add(photo.id);
            syncThumbnailErrors();
          }
        })
        .finally(() => {
          thumbnailRequestsRef.current.delete(photo.id);
        });
    }
  }, [photos, syncThumbnailErrors, syncThumbnailUrls, tripId]);

  function togglePhoto(photoId: string) {
    if (disabled) return;
    if (selectedIdSet.has(photoId)) {
      onSelectionChange(selectedIds.filter((id) => id !== photoId));
      return;
    }
    if (selectedIds.length >= 50) return;
    onSelectionChange([...selectedIds, photoId]);
  }

  function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    void loadPhotos({ append: true, cursor: nextCursor });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <span>{error}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => void loadPhotos()}>
          <RefreshCcw />
          Retry
        </Button>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        No photos available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2 sm:max-h-[26rem] sm:grid-cols-3 md:grid-cols-4">
        {photos.map((photo) => {
          const checked = selectedIdSet.has(photo.id);
          const selectedOrder = selectedOrderById.get(photo.id);
          const thumbnailUrl = thumbnailUrls[photo.id] ?? null;
          const thumbnailFailed = thumbnailErrors.has(photo.id);
          const selectionDisabled = disabled || (!checked && selectedIds.length >= 50);
          return (
            <label
              key={photo.id}
              className={cn(
                "group relative overflow-hidden rounded-md border bg-background text-sm shadow-xs transition",
                "hover:border-foreground/30 hover:shadow-sm",
                "focus-within:ring-[3px] focus-within:ring-ring/50",
                checked && "border-foreground ring-2 ring-foreground/10",
                selectionDisabled && "cursor-not-allowed opacity-60",
                !selectionDisabled && "cursor-pointer",
              )}
            >
              <input
                type="checkbox"
                aria-label={`${checked ? "Deselect" : "Select"} photo ${photo.id} uploaded by ${photo.uploaded_by.display_name}`}
                checked={checked}
                disabled={selectionDisabled}
                onChange={() => togglePhoto(photo.id)}
                className="sr-only"
              />
              <span className="relative block aspect-square overflow-hidden bg-muted">
                {thumbnailUrl ? (
                  <img
                    alt={photoAlt(photo)}
                    src={thumbnailUrl}
                    width={photo.thumbnail_width}
                    height={photo.thumbnail_height}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                    {thumbnailFailed ? <ImageIcon className="size-6" /> : <Spinner />}
                  </span>
                )}
                <span
                  className={cn(
                    "absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10",
                    checked && "bg-black/20 group-hover:bg-black/20",
                  )}
                />
                <span
                  className={cn(
                    "absolute left-2 top-2 flex size-6 items-center justify-center rounded-full border text-xs font-semibold shadow-sm",
                    checked
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background/90 text-transparent",
                  )}
                >
                  {selectedOrder}
                </span>
              </span>
              <span className="block min-w-0 px-2 py-2">
                <span className="block truncate text-xs font-medium">
                  {photo.uploaded_by.display_name}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {formatPhotoDate(photo.created_at)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {nextCursor ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || loadingMore}
          onClick={handleLoadMore}
        >
          {loadingMore ? null : <RefreshCcw />}
          {loadingMore ? "Loading photos" : "Load more photos"}
        </Button>
      ) : null}
    </div>
  );
}
