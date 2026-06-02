"use client";

/* eslint-disable @next/next/no-img-element -- Blob object URLs cannot be optimized by next/image. */

import { ImageIcon, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { TripPhoto } from "@/features/trips/domain/photo-types";
import { getTripPhotoErrorMessage } from "@/features/trips/domain/photo-errors";
import {
  bffFetchTripPhotoAssetBlob,
  bffListTripPhotos,
} from "@/features/trips/infrastructure/photos-api";
import { useAssetBlobUrlMap } from "@/features/trips/presentation/use-asset-blob-url";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

type MemoryPhotoPickerProps = {
  disabled?: boolean;
  maxSelectable: number;
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
  maxSelectable,
  selectedIds,
  tripId,
  onSelectionChange,
}: MemoryPhotoPickerProps) {
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedOrderById = useMemo(
    () => new Map(selectedIds.map((id, index) => [id, index + 1])),
    [selectedIds],
  );

  const getPhotoId = useCallback((photo: TripPhoto) => photo.id, []);
  const fetchThumbnailBlob = useCallback(
    (photo: TripPhoto, signal: AbortSignal) =>
      bffFetchTripPhotoAssetBlob(tripId, photo.id, "thumbnail", { signal }),
    [tripId],
  );
  const { errors: thumbnailErrors, urls: thumbnailUrls } = useAssetBlobUrlMap({
    fetchBlob: fetchThumbnailBlob,
    getId: getPhotoId,
    items: photos,
    resetKey: tripId,
  });

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

  function togglePhoto(photoId: string) {
    if (disabled) return;
    if (selectedIdSet.has(photoId)) {
      onSelectionChange(selectedIds.filter((id) => id !== photoId));
      return;
    }
    if (selectedIds.length >= maxSelectable) return;
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
          const selectionDisabled = disabled || (!checked && selectedIds.length >= maxSelectable);
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
