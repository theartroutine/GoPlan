"use client";

import { useCallback, useState } from "react";

import { Download, Loader2, X } from "lucide-react";

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";
import { bffFetchTripMemoryAssetBlob } from "@/features/trips/infrastructure/memories-api";
import { useAssetBlobUrl } from "@/features/trips/presentation/use-asset-blob-url";
import { Button } from "@/shared/ui/button";

type MemoryVideoViewerProps = {
  tripId: string;
  memory: TripMemoryVideo;
  onClose: () => void;
};

type VideoStreamState = {
  assetKey: string;
  status: "error" | "loading" | "ready";
};

function memoryAssetPath(
  tripId: string,
  memoryId: string,
  variant: "download" | "video",
): string {
  return `/api/trips/${encodeURIComponent(tripId)}/memories/${encodeURIComponent(memoryId)}/${variant}`;
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function formatDownloadFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug || "trip-memory"}.mp4`;
}

export function MemoryVideoViewer({ tripId, memory, onClose }: MemoryVideoViewerProps) {
  const title = memory.title.trim() || "Trip memory";
  const duration = formatDuration(memory.duration_seconds);
  const isReady = memory.status === "ready";
  const posterAssetKey = isReady
    ? `${tripId}:${memory.id}:${memory.updated_at}:poster`
    : null;
  const fetchPosterBlob = useCallback(
    (signal: AbortSignal) =>
      bffFetchTripMemoryAssetBlob(tripId, memory.id, "poster", { signal }),
    [memory.id, tripId],
  );
  const posterAsset = useAssetBlobUrl({
    assetKey: posterAssetKey,
    fetchBlob: fetchPosterBlob,
  });
  const videoAssetKey = isReady
    ? `${tripId}:${memory.id}:${memory.updated_at}:video`
    : null;
  const [videoStream, setVideoStream] = useState<VideoStreamState | null>(null);
  const currentVideoStream =
    videoStream?.assetKey === videoAssetKey ? videoStream : null;
  const videoHref = isReady ? memoryAssetPath(tripId, memory.id, "video") : null;
  const videoStatus = currentVideoStream?.status ?? (videoHref ? "loading" : null);
  const downloadHref = memoryAssetPath(tripId, memory.id, "download");
  const downloadFileName = formatDownloadFileName(title);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {memory.source_photo_count} photos
            {duration ? ` · ${duration}` : ""}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
          <X />
          <span className="sr-only">Close viewer</span>
        </Button>
      </div>

      {isReady ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
          {videoStatus === "loading" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-sm text-white/80">
              <Loader2 className="size-5 animate-spin" />
              Loading video...
            </div>
          ) : null}
          {videoStatus === "error" ? (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-white/80">
              Could not load this video.
            </div>
          ) : null}
          {videoHref ? (
            <video
              aria-label={`${title} video`}
              className="size-full"
              controls
              onError={() => {
                if (!videoAssetKey) return;
                setVideoStream({ assetKey: videoAssetKey, status: "error" });
              }}
              onLoadedMetadata={() => {
                if (!videoAssetKey) return;
                setVideoStream({ assetKey: videoAssetKey, status: "ready" });
              }}
              playsInline
              poster={posterAsset.url ?? undefined}
              preload="metadata"
              src={videoHref}
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
          <a href={downloadHref} download={downloadFileName}>
            <Download />
            Download
          </a>
        </Button>
      ) : null}
    </div>
  );
}
