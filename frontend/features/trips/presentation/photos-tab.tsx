"use client";

/* eslint-disable @next/next/no-img-element -- Protected BFF image endpoints rely on browser auth cookies. */

import {
  ImageIcon,
  Loader2,
  RefreshCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TripPhoto } from "@/features/trips/domain/photo-types";
import {
  getTripPhotoErrorMessage,
  validateTripPhotoFiles,
} from "@/features/trips/domain/photo-errors";
import {
  bffDeleteTripPhoto,
  bffListTripPhotos,
  bffUploadTripPhotos,
  getTripPhotoAssetUrl,
} from "@/features/trips/infrastructure/photos-api";
import { useTripContext } from "@/features/trips/presentation/trip-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Spinner } from "@/shared/ui/spinner";

const LOAD_ERROR = "Could not load trip photos.";
const UPLOAD_ERROR = "Could not upload photos.";
const DELETE_ERROR = "Could not delete this photo.";

function photoAlt(photo: TripPhoto): string {
  return `Photo uploaded by ${photo.uploaded_by.display_name}`;
}

function photoDescription(photo: TripPhoto): string {
  return `photo uploaded by ${photo.uploaded_by.display_name}`;
}

function PhotoTile({
  tripId,
  photo,
  onOpen,
  onDelete,
}: {
  tripId: string;
  photo: TripPhoto;
  onOpen: (photo: TripPhoto) => void;
  onDelete: (photo: TripPhoto) => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        aria-label={`Open ${photoDescription(photo)}`}
        onClick={() => onOpen(photo)}
        className="block aspect-[4/3] w-full overflow-hidden bg-muted text-left outline-none transition-opacity hover:opacity-95 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <img
          alt={photoAlt(photo)}
          src={getTripPhotoAssetUrl(tripId, photo.id, "thumbnail")}
          width={photo.thumbnail_width}
          height={photo.thumbnail_height}
          className="h-full w-full object-cover"
          loading="lazy"
        />
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
  );
}

export function PhotosTab() {
  const { tripId } = useTripContext();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<TripPhoto | null>(null);
  const [photoPendingDelete, setPhotoPendingDelete] = useState<TripPhoto | null>(null);

  const loadFirstPage = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const page = await bffListTripPhotos(tripId, { signal });
      if (signal?.aborted) return;
      setPhotos(page.results);
      setNextCursor(page.nextCursor);
    } catch (err) {
      if (!signal?.aborted) {
        setError(getTripPhotoErrorMessage(err, LOAD_ERROR));
        setPhotos([]);
        setNextCursor(null);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadFirstPage(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadFirstPage]);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);

    try {
      const page = await bffListTripPhotos(tripId, { cursor: nextCursor });
      setPhotos((current) => [...current, ...page.results]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(getTripPhotoErrorMessage(err, LOAD_ERROR));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleFilesSelected(files: File[]) {
    const validation = validateTripPhotoFiles(files);
    setUploadError(null);
    setError(null);

    if (!validation.ok) {
      setUploadError(validation.message);
      return;
    }

    setUploading(true);
    try {
      const uploaded = await bffUploadTripPhotos(tripId, files);
      setPhotos((current) => [...uploaded, ...current]);
    } catch (err) {
      setUploadError(getTripPhotoErrorMessage(err, UPLOAD_ERROR));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleConfirmDelete() {
    if (!photoPendingDelete || deleting) return;
    const photo = photoPendingDelete;
    setDeleting(true);
    setDeleteError(null);

    try {
      await bffDeleteTripPhoto(tripId, photo.id);
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
      if (selectedPhoto?.id === photo.id) setSelectedPhoto(null);
      setPhotoPendingDelete(null);
    } catch (err) {
      setDeleteError(getTripPhotoErrorMessage(err, DELETE_ERROR));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Share JPEG, PNG, or WebP photos with trip members.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              void handleFilesSelected(files);
            }}
          />
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            size="sm"
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            Upload photos
          </Button>
        </div>
      </div>

      {uploadError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {uploadError}
        </div>
      ) : null}
      {deleteError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {deleteError}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void loadFirstPage();
            }}
          >
            <RefreshCcw />
            Retry
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : null}

      {!loading && photos.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
          <ImageIcon className="mb-3 size-10 text-muted-foreground" />
          <h2 className="text-base font-semibold">No photos yet.</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Upload the first photos from this trip.
          </p>
        </div>
      ) : null}

      {!loading && photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {photos.map((photo) => (
            <PhotoTile
              key={photo.id}
              tripId={tripId}
              photo={photo}
              onOpen={setSelectedPhoto}
              onDelete={setPhotoPendingDelete}
            />
          ))}
        </div>
      ) : null}

      {!loading && nextCursor ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleLoadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? <Loader2 className="animate-spin" /> : null}
            Load more photos
          </Button>
        </div>
      ) : null}

      <Dialog open={selectedPhoto !== null} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
        <DialogContent className="max-w-5xl p-3 sm:p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>Photo detail</DialogTitle>
            <DialogDescription>Optimized trip photo preview.</DialogDescription>
          </DialogHeader>
          {selectedPhoto ? (
            <div className="flex max-h-[calc(100dvh-6rem)] items-center justify-center overflow-hidden rounded-md bg-black">
              <img
                alt={`Selected ${photoDescription(selectedPhoto)}`}
                src={getTripPhotoAssetUrl(tripId, selectedPhoto.id, "medium")}
                width={selectedPhoto.medium_width}
                height={selectedPhoto.medium_height}
                className="max-h-[calc(100dvh-6rem)] w-auto max-w-full object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={photoPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPhotoPendingDelete(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the optimized photo from the trip gallery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {deleting ? <Loader2 className="animate-spin" /> : null}
              Delete photo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
