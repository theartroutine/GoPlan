"use client";

/* eslint-disable @next/next/no-img-element -- Blob object URLs cannot be optimized by next/image. */

import { Check, CheckSquare, Download, ImageIcon } from "lucide-react";

import type { TripPhoto } from "@/features/trips/domain/photo-types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { Spinner } from "@/shared/ui/spinner";
import { cn } from "@/shared/lib/utils";

function photoAlt(photo: TripPhoto): string {
  return `Photo uploaded by ${photo.uploaded_by.display_name}`;
}

function photoDescription(photo: TripPhoto): string {
  return `photo uploaded by ${photo.uploaded_by.display_name}`;
}

export type PhotoGridProps = {
  photos: TripPhoto[];
  thumbnailErrors?: ReadonlySet<string>;
  thumbnailUrls: Record<string, string>;
  selectionMode: boolean;
  selectedIds: ReadonlySet<string>;
  onOpen: (photo: TripPhoto) => void;
  onToggleSelect: (photo: TripPhoto) => void;
  onRequestDownload: (photo: TripPhoto) => void;
  onEnterSelection: (photo: TripPhoto) => void;
};

export function PhotoGrid({
  photos,
  thumbnailErrors,
  thumbnailUrls,
  selectionMode,
  selectedIds,
  onOpen,
  onToggleSelect,
  onRequestDownload,
  onEnterSelection,
}: PhotoGridProps) {
  return (
    <div className="-mx-4 -mt-3 grid grid-cols-3 gap-1 sm:-mx-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
      {photos.map((photo) => {
        const thumbnailUrl = thumbnailUrls[photo.id];
        const thumbnailFailed = thumbnailErrors?.has(photo.id) ?? false;
        const selected = selectedIds.has(photo.id);

        return (
          <ContextMenu key={photo.id}>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                aria-label={
                  selectionMode
                    ? `${selected ? "Deselect" : "Select"} ${photoDescription(photo)}`
                    : `Open ${photoDescription(photo)}`
                }
                aria-pressed={selectionMode ? selected : undefined}
                onClick={() =>
                  selectionMode ? onToggleSelect(photo) : onOpen(photo)
                }
                className="group relative block aspect-square w-full overflow-hidden bg-muted outline-none transition-opacity hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {thumbnailUrl ? (
                  <img
                    alt={photoAlt(photo)}
                    src={thumbnailUrl}
                    width={photo.thumbnail_width}
                    height={photo.thumbnail_height}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    {thumbnailFailed ? <ImageIcon className="size-6" /> : <Spinner />}
                  </div>
                )}

                {selectionMode ? (
                  <>
                    {selected ? (
                      <span className="pointer-events-none absolute inset-0 bg-primary/15 ring-2 ring-inset ring-primary" />
                    ) : null}
                    <span
                      className={cn(
                        "pointer-events-none absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full border-2",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-white/80 bg-black/30",
                      )}
                    >
                      {selected ? <Check className="size-3.5" /> : null}
                    </span>
                  </>
                ) : null}
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => onRequestDownload(photo)}>
                <Download />
                Download
              </ContextMenuItem>
              {!selectionMode ? (
                <ContextMenuItem onSelect={() => onEnterSelection(photo)}>
                  <CheckSquare />
                  Select
                </ContextMenuItem>
              ) : null}
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}
