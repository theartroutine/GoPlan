"use client";

import { useEffect, useState } from "react";

import {
  Clock3,
  Download,
  Film,
  Images,
  Loader2,
  Music2,
  Play,
  Share2,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";
import { bffFetchTripMemoryAssetBlob } from "@/features/trips/infrastructure/memories-api";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

type MemoryVideoCardProps = {
  memory: TripMemoryVideo;
  onDelete: (memory: TripMemoryVideo) => void;
  onPlay: (memory: TripMemoryVideo) => void;
  onShare: (memory: TripMemoryVideo) => void;
};

type PosterPreviewState = {
  assetKey: string;
  failed: boolean;
  url: string | null;
};

const FAILED_STATUS_LABEL = "Render failed";

function isInProgressStatus(status: TripMemoryVideo["status"]): boolean {
  return status === "queued" || status === "rendering";
}

function StatusIcon({
  className,
  status,
}: {
  className?: string;
  status: TripMemoryVideo["status"];
}) {
  const iconClassName = cn("size-3.5", className);
  if (status === "failed") {
    return <TriangleAlert className={cn(iconClassName, "text-destructive")} />;
  }
  if (status === "ready") return <Film className={iconClassName} />;
  if (status === "rendering") return <Loader2 className={cn(iconClassName, "animate-spin")} />;
  return <Clock3 className={iconClassName} />;
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

export function MemoryVideoCard({
  memory,
  onDelete,
  onPlay,
  onShare,
}: MemoryVideoCardProps) {
  const [posterPreview, setPosterPreview] = useState<PosterPreviewState | null>(null);
  const title = memory.title.trim() || "Untitled memory";
  const duration = formatDuration(memory.duration_seconds);
  const canDelete = memory.can_manage && (memory.status === "ready" || memory.status === "failed");
  const isReady = memory.status === "ready";
  const isInProgress = isInProgressStatus(memory.status);
  const posterAssetKey = isReady ? `${memory.id}:${memory.updated_at}` : null;
  const posterUrl = posterPreview?.assetKey === posterAssetKey ? posterPreview.url : null;
  const posterFailed =
    posterPreview?.assetKey === posterAssetKey ? posterPreview.failed : false;

  useEffect(() => {
    if (!posterAssetKey) return undefined;

    const controller = new AbortController();
    let objectUrl: string | null = null;

    void bffFetchTripMemoryAssetBlob(memory.trip_id, memory.id, "poster", {
      signal: controller.signal,
    })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPosterPreview({ assetKey: posterAssetKey, failed: false, url: objectUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPosterPreview({ assetKey: posterAssetKey, failed: true, url: null });
        }
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [memory.id, memory.trip_id, posterAssetKey]);

  const previewClassName = cn(
    "relative aspect-video w-full overflow-hidden rounded-md border border-border/70 bg-muted sm:w-48 sm:shrink-0 lg:w-56",
    isReady
      ? "cursor-pointer text-left outline-none transition-[border-color,box-shadow,transform] hover:border-foreground/20 hover:shadow-md focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      : null,
  );
  const previewContent = (
    <>
      <div className="absolute inset-0 bg-muted" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(255,255,255,0.22),transparent_32%),linear-gradient(135deg,rgba(14,165,233,0.22),transparent_48%,rgba(245,158,11,0.18))]" />
      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
        <div className="flex size-12 items-center justify-center rounded-full border bg-background/80 shadow-sm backdrop-blur">
          <StatusIcon className="size-5" status={memory.status} />
        </div>
      </div>
      {posterUrl && !posterFailed ? (
        // eslint-disable-next-line @next/next/no-img-element -- poster is loaded as an authenticated BFF blob URL.
        <img
          alt={`${title} preview`}
          className="absolute inset-0 size-full object-cover"
          decoding="async"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
            if (!posterAssetKey) return;
            setPosterPreview((current) =>
              current?.assetKey === posterAssetKey
                ? { ...current, failed: true }
                : current,
            );
          }}
          src={posterUrl}
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
      {isReady ? (
        <div className="absolute inset-0 flex items-center justify-center opacity-95 transition-opacity group-hover:opacity-100">
          <div className="flex size-12 items-center justify-center rounded-full bg-white/90 text-zinc-950 shadow-lg shadow-black/25 backdrop-blur">
            <Play className="ml-0.5 size-5 fill-current" />
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <article
      className={cn(
        "group relative isolate overflow-hidden rounded-md border text-card-foreground shadow-xs transition-[border-color,box-shadow]",
        isInProgress
          ? "memory-progress-border border-transparent p-[3px] shadow-md"
          : "border-border bg-card hover:border-foreground/15 hover:shadow-sm",
      )}
      data-testid={`memory-card-${memory.id}`}
      aria-busy={isInProgress || undefined}
    >
      <div
        className={cn(
          "relative z-10 flex flex-col gap-3 bg-card p-3 sm:flex-row sm:p-4",
          isInProgress ? "rounded-[4px]" : "rounded-md",
        )}
      >
        {isReady ? (
          <button
            aria-label={`Play ${title}`}
            className={previewClassName}
            onClick={() => onPlay(memory)}
            type="button"
          >
            {previewContent}
          </button>
        ) : (
          <div className={previewClassName}>{previewContent}</div>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h2 className="truncate text-base font-semibold">{title}</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Images className="size-3.5" />
                  {memory.source_photo_count} photos
                </span>
                {duration ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="size-3.5" />
                    {duration}
                  </span>
                ) : null}
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Music2 className="size-3.5 shrink-0" />
                  <span className="truncate">{memory.music.title}</span>
                </span>
              </div>
            </div>
            {memory.status === "failed" ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-destructive/25 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                <StatusIcon status={memory.status} />
                {FAILED_STATUS_LABEL}
              </span>
            ) : null}
          </div>

          {memory.status === "failed" && memory.render_error ? (
            <p className="text-sm text-destructive" role="alert">
              {memory.render_error.message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {isReady && memory.can_download ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Download className="size-3" />
                Download available
              </span>
            ) : null}
            {isReady && memory.can_manage ? (
              <Button type="button" size="sm" variant="outline" onClick={() => onShare(memory)}>
                <Share2 />
                Share
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onDelete(memory)}
              >
                <Trash2 />
                Delete memory
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
