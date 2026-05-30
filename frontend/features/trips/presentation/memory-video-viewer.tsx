"use client";

import { Download, X } from "lucide-react";

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";
import { Button } from "@/shared/ui/button";

type MemoryVideoViewerProps = {
  tripId: string;
  memory: TripMemoryVideo;
  onClose: () => void;
};

function memoryAssetPath(
  tripId: string,
  memoryId: string,
  variant: "video" | "download",
): string {
  return `/api/trips/${encodeURIComponent(tripId)}/memories/${encodeURIComponent(memoryId)}/${variant}`;
}

export function MemoryVideoViewer({ tripId, memory, onClose }: MemoryVideoViewerProps) {
  const title = memory.title.trim() || "Trip memory";
  const videoSrc = memoryAssetPath(tripId, memory.id, "video");
  const downloadHref = memoryAssetPath(tripId, memory.id, "download");

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

      {memory.status === "ready" ? (
        <video
          aria-label={`${title} video`}
          className="aspect-video w-full rounded-md bg-black"
          controls
          playsInline
          preload="metadata"
          src={videoSrc}
        />
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
          <a href={downloadHref}>
            <Download />
            Download
          </a>
        </Button>
      ) : null}
    </div>
  );
}
