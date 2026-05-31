"use client";

import { useEffect, useState } from "react";

import { Download, Loader2, X } from "lucide-react";

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";
import { bffFetchTripMemoryAssetBlob } from "@/features/trips/infrastructure/memories-api";
import { Button } from "@/shared/ui/button";

type MemoryVideoViewerProps = {
  tripId: string;
  memory: TripMemoryVideo;
  onClose: () => void;
};

type MemoryAssetBlobState = {
  assetKey: string;
  status: "error" | "ready";
  url: string | null;
};

const VIDEO_ASSET_TIMEOUT_MS = 60_000;

function memoryAssetPath(
  tripId: string,
  memoryId: string,
  variant: "download",
): string {
  return `/api/trips/${encodeURIComponent(tripId)}/memories/${encodeURIComponent(memoryId)}/${variant}`;
}

function formatDownloadFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug || "trip-memory"}.mp4`;
}

function useMemoryAssetBlobUrl({
  enabled,
  memoryId,
  timeoutMs,
  tripId,
  updatedAt,
  variant,
}: {
  enabled: boolean;
  memoryId: string;
  timeoutMs?: number;
  tripId: string;
  updatedAt: string;
  variant: "poster" | "video";
}) {
  const assetKey = enabled ? `${tripId}:${memoryId}:${updatedAt}:${variant}` : null;
  const [asset, setAsset] = useState<MemoryAssetBlobState | null>(null);

  useEffect(() => {
    if (!assetKey) return undefined;

    const controller = new AbortController();
    let objectUrl: string | null = null;

    void bffFetchTripMemoryAssetBlob(tripId, memoryId, variant, {
      signal: controller.signal,
      timeoutMs,
    })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setAsset({ assetKey, status: "ready", url: objectUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAsset({ assetKey, status: "error", url: null });
        }
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetKey, memoryId, timeoutMs, tripId, variant]);

  const currentAsset = asset?.assetKey === assetKey ? asset : null;
  return {
    error: currentAsset?.status === "error",
    loading: Boolean(assetKey) && !currentAsset,
    url: currentAsset?.url ?? null,
  };
}

export function MemoryVideoViewer({ tripId, memory, onClose }: MemoryVideoViewerProps) {
  const title = memory.title.trim() || "Trip memory";
  const isReady = memory.status === "ready";
  const posterAsset = useMemoryAssetBlobUrl({
    enabled: isReady,
    memoryId: memory.id,
    tripId,
    updatedAt: memory.updated_at,
    variant: "poster",
  });
  const videoAsset = useMemoryAssetBlobUrl({
    enabled: isReady,
    memoryId: memory.id,
    timeoutMs: VIDEO_ASSET_TIMEOUT_MS,
    tripId,
    updatedAt: memory.updated_at,
    variant: "video",
  });
  const downloadHref = memoryAssetPath(tripId, memory.id, "download");
  const downloadUrl = videoAsset.url ?? downloadHref;
  const downloadFileName = formatDownloadFileName(title);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {memory.source_photo_count} photos
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
          <X />
          <span className="sr-only">Close viewer</span>
        </Button>
      </div>

      {isReady ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
          {videoAsset.loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-sm text-white/80">
              <Loader2 className="size-5 animate-spin" />
              Loading video...
            </div>
          ) : null}
          {videoAsset.error ? (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-white/80">
              Could not load this video.
            </div>
          ) : null}
          {videoAsset.url ? (
            <video
              aria-label={`${title} video`}
              className="size-full"
              controls
              playsInline
              poster={posterAsset.url ?? undefined}
              preload="metadata"
              src={videoAsset.url}
            />
          ) : null}
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-sm text-muted-foreground">
          Video is not ready yet.
        </div>
      )}

      {memory.music.license ? (
        <p className="text-xs text-muted-foreground">
          Music: {memory.music.title} by {memory.music.artist} — {memory.music.license}
        </p>
      ) : null}

      {memory.can_download ? (
        <Button asChild type="button" variant="outline">
          <a href={downloadUrl} download={videoAsset.url ? downloadFileName : undefined}>
            <Download />
            Download
          </a>
        </Button>
      ) : null}
    </div>
  );
}
