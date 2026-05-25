"use client";

/* eslint-disable @next/next/no-img-element -- Blob object URLs cannot be optimized by next/image. */

import { Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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

const CONTROLS_AUTO_HIDE_MS = 2500;

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
  onClose: () => void;
  onRequestDelete: (photo: TripPhoto) => void;
};

export function PhotoLightbox({
  photo,
  mediumUrl,
  loading,
  error,
  onClose,
  onRequestDelete,
}: PhotoLightboxProps) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_AUTO_HIDE_MS);
  }, [clearHideTimer]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    if (!photo) {
      clearHideTimer();
      return;
    }
    scheduleHide();
    return () => {
      clearHideTimer();
    };
  }, [clearHideTimer, photo, scheduleHide]);

  return (
    <Dialog open={photo !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-[min(96vw,1400px)] border-none bg-black p-0"
        onMouseMove={revealControls}
        onTouchStart={revealControls}
        onKeyDown={revealControls}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Photo detail</DialogTitle>
          <DialogDescription>Optimized trip photo preview.</DialogDescription>
        </DialogHeader>
        {photo ? (
          <div className="relative flex max-h-[calc(100dvh-2rem)] min-h-72 items-center justify-center overflow-hidden bg-black">
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
                className="max-h-[calc(100dvh-2rem)] w-auto max-w-full object-contain"
              />
            ) : null}

            <div
              data-photo-lightbox-controls
              data-visible={controlsVisible ? "true" : "false"}
              className={
                controlsVisible
                  ? "pointer-events-none absolute inset-0 transition-opacity duration-300 opacity-100"
                  : "pointer-events-none absolute inset-0 transition-opacity duration-300 opacity-0"
              }
            >
              <div className="pointer-events-auto absolute right-3 top-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close photo viewer"
                  tabIndex={controlsVisible ? 0 : -1}
                  onClick={() => {
                    clearHideTimer();
                    onClose();
                  }}
                  className="rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
                >
                  <X />
                </Button>
              </div>
              <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent p-4">
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
                      scheduleHide();
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
