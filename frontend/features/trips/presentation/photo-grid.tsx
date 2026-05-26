"use client";

/* eslint-disable @next/next/no-img-element -- Blob object URLs cannot be optimized by next/image. */

import type { TripPhoto } from "@/features/trips/domain/photo-types";
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
};

export function PhotoGrid({ photos, thumbnailUrls, onOpen }: PhotoGridProps) {
  return (
    <div className="-mx-4 grid grid-cols-3 gap-1 sm:-mx-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
      {photos.map((photo) => (
        <button
          key={photo.id}
          type="button"
          aria-label={`Open ${photoDescription(photo)}`}
          onClick={() => onOpen(photo)}
          className="group relative block aspect-square w-full overflow-hidden bg-muted outline-none transition-opacity hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
      ))}
    </div>
  );
}
