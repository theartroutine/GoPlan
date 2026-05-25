"use client";

/* eslint-disable @next/next/no-img-element -- Blob object URLs cannot be optimized by next/image. */

import { Trash2 } from "lucide-react";

import type { TripPhoto } from "@/features/trips/domain/photo-types";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

function photoAlt(photo: TripPhoto): string {
  return `Photo uploaded by ${photo.uploaded_by.display_name}`;
}

function photoDescription(photo: TripPhoto): string {
  return `photo uploaded by ${photo.uploaded_by.display_name}`;
}

export type PhotoGridProps = {
  photos: TripPhoto[];
  thumbnailUrls: Record<string, string>;
  onOpen: (photo: TripPhoto) => void;
  onDelete: (photo: TripPhoto) => void;
};

export function PhotoGrid({ photos, thumbnailUrls, onOpen, onDelete }: PhotoGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {photos.map((photo) => (
        <div
          key={photo.id}
          className="group relative overflow-hidden rounded-lg border border-border bg-card"
        >
          <button
            type="button"
            aria-label={`Open ${photoDescription(photo)}`}
            onClick={() => onOpen(photo)}
            className="block aspect-[4/3] w-full overflow-hidden bg-muted text-left outline-none transition-opacity hover:opacity-95 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {thumbnailUrls[photo.id] ? (
              <img
                alt={photoAlt(photo)}
                src={thumbnailUrls[photo.id]}
                width={photo.thumbnail_width}
                height={photo.thumbnail_height}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <Spinner />
              </div>
            )}
          </button>
          <div className="flex min-h-12 items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{photo.uploaded_by.display_name}</p>
              <p className="text-xs text-muted-foreground">
                {new Intl.DateTimeFormat(undefined, {
                  month: "short",
                  day: "numeric",
                }).format(new Date(photo.created_at))}
              </p>
            </div>
            {photo.can_delete ? (
              <Button
                aria-label={`Delete ${photoDescription(photo)}`}
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(photo)}
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
