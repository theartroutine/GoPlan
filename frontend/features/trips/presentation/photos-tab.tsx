"use client";

import {
  ImageIcon,
  Loader2,
  RefreshCcw,
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
  bffFetchTripPhotoAssetBlob,
  bffListTripPhotos,
  bffUploadTripPhotos,
} from "@/features/trips/infrastructure/photos-api";
import { PhotoGrid } from "@/features/trips/presentation/photo-grid";
import { PhotoLightbox } from "@/features/trips/presentation/photo-lightbox";
import { calculateInitialPhotoPageSizeFromElement } from "@/features/trips/presentation/photo-page-size";
import { useTripContext } from "@/features/trips/presentation/trip-context";
import {
  useAssetBlobUrl,
  useAssetBlobUrlMap,
} from "@/features/trips/presentation/use-asset-blob-url";
import { UploadFab } from "@/features/trips/presentation/upload-fab";
import { UploadReviewDialog } from "@/features/trips/presentation/upload-review-dialog";
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
import { Spinner } from "@/shared/ui/spinner";

const LOAD_ERROR = "Could not load trip photos.";
const UPLOAD_ERROR = "Could not upload photos.";
const DELETE_ERROR = "Could not delete this photo.";

export function PhotosTab() {
  const { tripId } = useTripContext();
  const galleryRootRef = useRef<HTMLDivElement | null>(null);
  const emptyStateInputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [stagedFiles, setStagedFiles] = useState<File[] | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<TripPhoto | null>(null);
  const [photoPendingDelete, setPhotoPendingDelete] = useState<TripPhoto | null>(null);
  const selectedPhotoId = selectedPhoto?.id ?? null;
  const selectedPhotoIndex = selectedPhoto
    ? photos.findIndex((photo) => photo.id === selectedPhoto.id)
    : -1;
  const canNavigatePreviousPhoto = selectedPhotoIndex > 0;
  const canNavigateNextPhoto =
    selectedPhotoIndex >= 0 && selectedPhotoIndex < photos.length - 1;

  const loadFirstPage = useCallback(async (signal?: AbortSignal) => {
    if (pageSize === null) return;

    setLoading(true);
    setError(null);

    try {
      const page = await bffListTripPhotos(tripId, { pageSize, signal });
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
  }, [pageSize, tripId]);

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
  const mediumAssetKey = selectedPhotoId
    ? `${tripId}:${selectedPhotoId}:medium`
    : null;
  const fetchMediumBlob = useCallback(
    (signal: AbortSignal) => {
      if (!selectedPhotoId) return Promise.reject(new Error("No selected photo."));
      return bffFetchTripPhotoAssetBlob(tripId, selectedPhotoId, "medium", {
        signal,
      });
    },
    [selectedPhotoId, tripId],
  );
  const mediumAsset = useAssetBlobUrl({
    assetKey: mediumAssetKey,
    fetchBlob: fetchMediumBlob,
  });
  const mediumError = mediumAsset.error
    ? getTripPhotoErrorMessage(mediumAsset.error, LOAD_ERROR)
    : null;

  useEffect(() => {
    setPageSize(calculateInitialPhotoPageSizeFromElement(galleryRootRef.current));
  }, [tripId]);

  useEffect(() => {
    if (pageSize === null) return;

    const controller = new AbortController();
    void loadFirstPage(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadFirstPage, pageSize]);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);

    try {
      const page = await bffListTripPhotos(tripId, {
        cursor: nextCursor,
        pageSize: pageSize ?? undefined,
      });
      setPhotos((current) => [...current, ...page.results]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(getTripPhotoErrorMessage(err, LOAD_ERROR));
    } finally {
      setLoadingMore(false);
    }
  }

  function handleFilesSelected(files: File[]) {
    const validation = validateTripPhotoFiles(files);
    setUploadError(null);
    setError(null);

    if (!validation.ok) {
      setUploadError(validation.message);
      return;
    }

    setStagedFiles(files);
  }

  function handleStageAddFiles(extra: File[]) {
    setStagedFiles((current) => {
      const base = current ?? [];
      const next = [...base, ...extra];
      const validation = validateTripPhotoFiles(next);
      if (!validation.ok) {
        setUploadError(validation.message);
        return current;
      }
      setUploadError(null);
      return next;
    });
  }

  function handleStageRemove(index: number) {
    const current = stagedFiles;
    if (!current) return;
    const next = current.filter((_, i) => i !== index);
    if (next.length === 0) {
      setStagedFiles(null);
      setUploadError(null);
      return;
    }
    setStagedFiles(next);
  }

  function handleStageCancel() {
    if (uploading) return;
    setStagedFiles(null);
    setUploadError(null);
  }

  async function handleStageConfirm() {
    if (!stagedFiles || stagedFiles.length === 0 || uploading) return;
    setUploading(true);
    setUploadError(null);

    try {
      const uploaded = await bffUploadTripPhotos(tripId, stagedFiles);
      setPhotos((current) => [...uploaded, ...current]);
      setStagedFiles(null);
    } catch (err) {
      setUploadError(getTripPhotoErrorMessage(err, UPLOAD_ERROR));
    } finally {
      setUploading(false);
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

  function handleNavigatePreviousPhoto() {
    if (!canNavigatePreviousPhoto) return;
    setSelectedPhoto(photos[selectedPhotoIndex - 1] ?? null);
  }

  function handleNavigateNextPhoto() {
    if (!canNavigateNextPhoto) return;
    setSelectedPhoto(photos[selectedPhotoIndex + 1] ?? null);
  }

  return (
    <div ref={galleryRootRef} className="space-y-4">
      {uploadError && stagedFiles === null ? (
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
          <Button
            type="button"
            className="mt-4"
            onClick={() => emptyStateInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload />
            Upload photos
          </Button>
          <input
            ref={emptyStateInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              if (files.length > 0) void handleFilesSelected(files);
              event.currentTarget.value = "";
            }}
          />
        </div>
      ) : null}

      {!loading && photos.length > 0 ? (
        <PhotoGrid
          photos={photos}
          thumbnailErrors={thumbnailErrors}
          thumbnailUrls={thumbnailUrls}
          onOpen={setSelectedPhoto}
        />
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

      <PhotoLightbox
        photo={selectedPhoto}
        mediumUrl={mediumAsset.url}
        loading={mediumAsset.loading}
        error={mediumError}
        canNavigatePrevious={canNavigatePreviousPhoto}
        canNavigateNext={canNavigateNextPhoto}
        onClose={() => setSelectedPhoto(null)}
        onRequestDelete={setPhotoPendingDelete}
        onNavigatePrevious={handleNavigatePreviousPhoto}
        onNavigateNext={handleNavigateNextPhoto}
      />

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

      <UploadFab onFilesSelected={handleFilesSelected} uploading={uploading} />

      <UploadReviewDialog
        open={stagedFiles !== null}
        files={stagedFiles ?? []}
        uploading={uploading}
        error={uploadError}
        onAddFiles={handleStageAddFiles}
        onRemoveFile={handleStageRemove}
        onCancel={handleStageCancel}
        onConfirm={() => void handleStageConfirm()}
      />
    </div>
  );
}
