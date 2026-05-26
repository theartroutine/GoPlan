"use client";

/* eslint-disable @next/next/no-img-element -- Blob object URLs cannot be optimized by next/image. */

import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type KeyboardEvent } from "react";

import type { TripPhoto } from "@/features/trips/domain/photo-types";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Spinner } from "@/shared/ui/spinner";

function photoDescription(photo: TripPhoto): string {
  return `photo uploaded by ${photo.uploaded_by.display_name}`;
}

function formatPhotoDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export type PhotoLightboxProps = {
  photo: TripPhoto | null;
  mediumUrl: string | null;
  loading: boolean;
  error: string | null;
  canNavigatePrevious: boolean;
  canNavigateNext: boolean;
  onClose: () => void;
  onRequestDelete: (photo: TripPhoto) => void;
  onNavigatePrevious: () => void;
  onNavigateNext: () => void;
};

export function PhotoLightbox({
  photo,
  mediumUrl,
  loading,
  error,
  canNavigatePrevious,
  canNavigateNext,
  onClose,
  onRequestDelete,
  onNavigatePrevious,
  onNavigateNext,
}: PhotoLightboxProps) {
  const [controlsVisible, setControlsVisible] = useState(false);

  const showControls = useCallback(() => {
    setControlsVisible(true);
  }, []);

  const hideControls = useCallback(() => {
    setControlsVisible(false);
  }, []);

  useEffect(() => {
    if (!photo) {
      setControlsVisible(false); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [photo]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (canNavigatePrevious) onNavigatePrevious();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (canNavigateNext) onNavigateNext();
      }
    },
    [canNavigateNext, canNavigatePrevious, onNavigateNext, onNavigatePrevious],
  );

  const handleClose = useCallback(() => {
    hideControls();
    onClose();
  }, [hideControls, onClose]);

  return (
    <Dialog open={photo !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-hidden rounded-none border-none bg-black p-0 shadow-none sm:max-w-none"
        showCloseButton={false}
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Photo detail</DialogTitle>
          <DialogDescription>Optimized trip photo preview.</DialogDescription>
        </DialogHeader>
        {photo ? (
          <div
            data-photo-lightbox-stage
            className="relative flex h-[100dvh] max-h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black"
            onMouseEnter={showControls}
            onMouseMove={showControls}
            onMouseLeave={hideControls}
          >
            {loading ? (
              <div className="flex min-h-72 w-full items-center justify-center text-white">
                <Spinner />
              </div>
            ) : null}
            {error ? (
              <div className="flex min-h-72 w-full items-center justify-center px-6 text-center text-sm text-white">
                {error}
              </div>
            ) : null}
            {mediumUrl ? (
              <img
                alt={`Selected ${photoDescription(photo)}`}
                src={mediumUrl}
                width={photo.medium_width}
                height={photo.medium_height}
                className="h-auto max-h-[100dvh] w-auto max-w-[100vw] object-contain"
              />
            ) : null}

            <div
              data-photo-lightbox-controls
              data-visible={controlsVisible ? "true" : "false"}
              aria-hidden={controlsVisible ? undefined : true}
              className={
                controlsVisible
                  ? "pointer-events-none absolute inset-0 opacity-100"
                  : "pointer-events-none absolute inset-0 opacity-0"
              }
            >
              <div
                className={
                  controlsVisible
                    ? "pointer-events-auto absolute right-3 top-3"
                    : "pointer-events-none absolute right-3 top-3"
                }
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close photo viewer"
                  tabIndex={controlsVisible ? 0 : -1}
                  onClick={handleClose}
                  className="rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
                >
                  <X />
                </Button>
              </div>
              <div className="absolute inset-y-0 left-3 flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Previous photo"
                  tabIndex={controlsVisible ? 0 : -1}
                  disabled={!canNavigatePrevious}
                  onClick={onNavigatePrevious}
                  className={
                    controlsVisible
                      ? "pointer-events-auto rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white disabled:bg-black/20 disabled:text-white/60"
                      : "pointer-events-none rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white disabled:bg-black/20 disabled:text-white/60"
                  }
                >
                  <ChevronLeft />
                </Button>
              </div>
              <div className="absolute inset-y-0 right-3 flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Next photo"
                  tabIndex={controlsVisible ? 0 : -1}
                  disabled={!canNavigateNext}
                  onClick={onNavigateNext}
                  className={
                    controlsVisible
                      ? "pointer-events-auto rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white disabled:bg-black/20 disabled:text-white/60"
                      : "pointer-events-none rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white disabled:bg-black/20 disabled:text-white/60"
                  }
                >
                  <ChevronRight />
                </Button>
              </div>
              <div
                className={
                  controlsVisible
                    ? "pointer-events-auto absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent p-4"
                    : "pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent p-4"
                }
              >
                <div className="min-w-0 text-white">
                  <p className="truncate text-sm font-medium">{photo.uploaded_by.display_name}</p>
                  <p className="text-xs text-white/70">{formatPhotoDate(photo.created_at)}</p>
                </div>
                {photo.can_delete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${photoDescription(photo)}`}
                    tabIndex={controlsVisible ? 0 : -1}
                    onClick={() => {
                      onRequestDelete(photo);
                    }}
                    className="rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
