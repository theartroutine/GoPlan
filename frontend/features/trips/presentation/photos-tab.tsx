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
import { useTripContext } from "@/features/trips/presentation/trip-context";
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
  const emptyStateInputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
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
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [mediumUrl, setMediumUrl] = useState<string | null>(null);
  const [mediumLoading, setMediumLoading] = useState(false);
  const [mediumError, setMediumError] = useState<string | null>(null);
  const thumbnailUrlsRef = useRef<Map<string, string>>(new Map());
  const thumbnailRequestsRef = useRef<Map<string, AbortController>>(new Map());
  const visiblePhotoIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(false);
  const mediumUrlRef = useRef<string | null>(null);

  const syncThumbnailUrls = useCallback(() => {
    setThumbnailUrls(Object.fromEntries(thumbnailUrlsRef.current.entries()));
  }, []);

  const revokeMediumUrl = useCallback(() => {
    if (mediumUrlRef.current) {
      URL.revokeObjectURL(mediumUrlRef.current);
      mediumUrlRef.current = null;
    }
  }, []);

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

  useEffect(() => {
    mountedRef.current = true;
    const thumbnailRequests = thumbnailRequestsRef.current;
    const thumbnailObjectUrls = thumbnailUrlsRef.current;

    return () => {
      mountedRef.current = false;
      for (const controller of thumbnailRequests.values()) {
        controller.abort();
      }
      thumbnailRequests.clear();
      for (const url of thumbnailObjectUrls.values()) {
        URL.revokeObjectURL(url);
      }
      thumbnailObjectUrls.clear();
      revokeMediumUrl();
    };
  }, [revokeMediumUrl]);

  useEffect(() => {
    for (const controller of thumbnailRequestsRef.current.values()) {
      controller.abort();
    }
    thumbnailRequestsRef.current.clear();
    for (const url of thumbnailUrlsRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    thumbnailUrlsRef.current.clear();
    visiblePhotoIdsRef.current = new Set();
    setThumbnailUrls({});
    revokeMediumUrl();
    setMediumUrl(null);
    setMediumLoading(false);
    setMediumError(null);
  }, [revokeMediumUrl, tripId]);

  useEffect(() => {
    const visibleIds = new Set(photos.map((photo) => photo.id));
    visiblePhotoIdsRef.current = visibleIds;

    let didChange = false;
    for (const [photoId, url] of thumbnailUrlsRef.current.entries()) {
      if (!visibleIds.has(photoId)) {
        URL.revokeObjectURL(url);
        thumbnailUrlsRef.current.delete(photoId);
        didChange = true;
      }
    }
    for (const [photoId, controller] of thumbnailRequestsRef.current.entries()) {
      if (!visibleIds.has(photoId)) {
        controller.abort();
        thumbnailRequestsRef.current.delete(photoId);
      }
    }
    if (didChange) syncThumbnailUrls();

    for (const photo of photos) {
      if (
        thumbnailUrlsRef.current.has(photo.id) ||
        thumbnailRequestsRef.current.has(photo.id)
      ) {
        continue;
      }

      const controller = new AbortController();
      thumbnailRequestsRef.current.set(photo.id, controller);
      void bffFetchTripPhotoAssetBlob(tripId, photo.id, "thumbnail", {
        signal: controller.signal,
      })
        .then((blob) => {
          if (
            controller.signal.aborted ||
            !mountedRef.current ||
            !visiblePhotoIdsRef.current.has(photo.id)
          ) {
            return;
          }

          const objectUrl = URL.createObjectURL(blob);
          const previousUrl = thumbnailUrlsRef.current.get(photo.id);
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          thumbnailUrlsRef.current.set(photo.id, objectUrl);
          syncThumbnailUrls();
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            setError(getTripPhotoErrorMessage(err, LOAD_ERROR));
          }
        })
        .finally(() => {
          thumbnailRequestsRef.current.delete(photo.id);
        });
    }
  }, [photos, syncThumbnailUrls, tripId]);

  useEffect(() => {
    if (!selectedPhoto) {
      revokeMediumUrl();
      setMediumUrl(null);
      setMediumLoading(false);
      setMediumError(null);
      return;
    }

    const controller = new AbortController();
    revokeMediumUrl();
    setMediumUrl(null);
    setMediumLoading(true);
    setMediumError(null);

    void bffFetchTripPhotoAssetBlob(tripId, selectedPhoto.id, "medium", {
      signal: controller.signal,
    })
      .then((blob) => {
        if (controller.signal.aborted) return;
        const objectUrl = URL.createObjectURL(blob);
        mediumUrlRef.current = objectUrl;
        setMediumUrl(objectUrl);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setMediumError(getTripPhotoErrorMessage(err, LOAD_ERROR));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setMediumLoading(false);
      });

    return () => {
      controller.abort();
      revokeMediumUrl();
    };
  }, [revokeMediumUrl, selectedPhoto, tripId]);

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

  return (
    <div className="space-y-4">
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
            className="sr-only"
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
        mediumUrl={mediumUrl}
        loading={mediumLoading}
        error={mediumError}
        onClose={() => setSelectedPhoto(null)}
        onRequestDelete={setPhotoPendingDelete}
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
