"use client";

/* eslint-disable @next/next/no-img-element -- Blob object URLs cannot be optimized by next/image. */

import type { TripPhoto } from "@/features/trips/domain/photo-types";
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
  onRequestDelete: _onRequestDelete, // eslint-disable-line @typescript-eslint/no-unused-vars -- wired in Task 5
}: PhotoLightboxProps) {
  return (
    <Dialog open={photo !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl p-3 sm:p-4">
        <DialogHeader className="sr-only">
          <DialogTitle>Photo detail</DialogTitle>
          <DialogDescription>Optimized trip photo preview.</DialogDescription>
        </DialogHeader>
        {photo ? (
          <div className="flex max-h-[calc(100dvh-6rem)] items-center justify-center overflow-hidden rounded-md bg-black">
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
                className="max-h-[calc(100dvh-6rem)] w-auto max-w-full object-contain"
              />
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
