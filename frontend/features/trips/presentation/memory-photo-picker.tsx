"use client";

import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { TripPhoto } from "@/features/trips/domain/photo-types";
import { getTripPhotoErrorMessage } from "@/features/trips/domain/photo-errors";
import { bffListTripPhotos } from "@/features/trips/infrastructure/photos-api";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

type MemoryPhotoPickerProps = {
  disabled?: boolean;
  selectedIds: string[];
  tripId: string;
  onSelectionChange: (ids: string[]) => void;
};

const LOAD_ERROR = "Could not load trip photos.";

export function MemoryPhotoPicker({
  disabled = false,
  selectedIds,
  tripId,
  onSelectionChange,
}: MemoryPhotoPickerProps) {
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (selectedIds.includes(photoId)) {
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
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {photos.map((photo) => {
          const checked = selectedIds.includes(photo.id);
          return (
            <label
              key={photo.id}
              className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled || (!checked && selectedIds.length >= 50)}
                onChange={() => togglePhoto(photo.id)}
              />
              <span className="min-w-0 flex-1 truncate">{photo.id}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {photo.uploaded_by.display_name}
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
