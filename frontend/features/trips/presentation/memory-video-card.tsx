"use client";

import { useEffect, useState } from "react";

import {
  Clock3,
  Download,
  Film,
  Images,
  Loader2,
  MoreVertical,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

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
const POSTER_GRADIENT =
  "bg-[radial-gradient(circle_at_24%_18%,rgba(255,255,255,0.22),transparent_32%),linear-gradient(135deg,rgba(14,165,233,0.22),transparent_48%,rgba(245,158,11,0.18))]";

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

function buildDownloadFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug || "trip-memory"}.mp4`;
}

export function MemoryVideoCard({
  memory,
  onDelete,
  onPlay,
  onShare,
}: MemoryVideoCardProps) {
  const [posterPreview, setPosterPreview] = useState<PosterPreviewState | null>(null);
  // Controlled open state so the trigger's click event can reliably open the menu in tests
  // (Radix's pointerDown-based toggle doesn't play well with jsdom's missing DismissableLayer
  // setTimeout tick, so we drive open state via onClick="always open" + Radix's onOpenChange).
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const title = memory.title.trim() || "Untitled memory";
  const duration = formatDuration(memory.duration_seconds);
  const isReady = memory.status === "ready";
  const isInProgress = isInProgressStatus(memory.status);
  const isFailed = memory.status === "failed";
  const canShare = isReady && memory.can_manage;
  const canDownload = isReady && memory.can_download;
  const canDelete = memory.can_manage && (isReady || isFailed);
  const hasMenu = canShare || canDownload || canDelete;
  const posterAssetKey = isReady ? `${memory.id}:${memory.updated_at}` : null;
  const posterUrl = posterPreview?.assetKey === posterAssetKey ? posterPreview.url : null;
  const posterFailed =
    posterPreview?.assetKey === posterAssetKey ? posterPreview.failed : false;
  const downloadHref = `/api/trips/${encodeURIComponent(memory.trip_id)}/memories/${encodeURIComponent(memory.id)}/download`;

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

  return (
    <article
      className={cn(
        "group relative isolate flex flex-col overflow-hidden rounded-lg border text-card-foreground shadow-xs transition-[border-color,box-shadow]",
        isInProgress
          ? "memory-progress-border border-transparent p-[3px] shadow-md"
          : "border-border bg-card hover:border-foreground/15 hover:shadow-md",
      )}
      data-testid={`memory-card-${memory.id}`}
      aria-busy={isInProgress || undefined}
    >
      <div
        className={cn(
          "relative z-10 flex flex-1 flex-col bg-card",
          isInProgress ? "rounded-[6px]" : "rounded-lg",
        )}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <div className={cn("absolute inset-0", POSTER_GRADIENT)} />
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
              onError={() => {
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />

          {isReady ? (
            <button
              aria-label={`Play ${title}`}
              className="absolute inset-0 flex items-center justify-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={() => onPlay(memory)}
              type="button"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-zinc-950 shadow-lg shadow-black/25 backdrop-blur transition-transform group-hover:scale-105">
                <Play className="ml-0.5 size-5 fill-current" />
              </span>
            </button>
          ) : null}

          {isReady && duration ? (
            <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
              {duration}
            </span>
          ) : null}

          {isInProgress ? (
            <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/55 px-2 py-0.5 text-xs font-medium text-white">
              {memory.status === "rendering" ? "Rendering…" : "Queued"}
            </span>
          ) : null}

          {isFailed ? (
            <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-background/90 px-2 py-1 text-xs font-medium text-destructive backdrop-blur">
              <StatusIcon status={memory.status} />
              {FAILED_STATUS_LABEL}
            </span>
          ) : null}

          {hasMenu ? (
            <DropdownMenu
              modal={false}
              open={actionsMenuOpen}
              onOpenChange={setActionsMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Memory actions"
                  className="absolute right-2 top-2 size-8 bg-background/80 backdrop-blur hover:bg-background"
                  // Drive open state via onClick so the menu reliably opens when the trigger
                  // is clicked regardless of prior open state (avoids jsdom toggle race).
                  onClick={() => setActionsMenuOpen(true)}
                  size="icon-sm"
                  type="button"
                  variant="secondary"
                >
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canShare ? (
                  <DropdownMenuItem onSelect={() => onShare(memory)}>
                    <Share2 />
                    Share
                  </DropdownMenuItem>
                ) : null}
                {canDownload ? (
                  <DropdownMenuItem asChild>
                    <a download={buildDownloadFileName(title)} href={downloadHref}>
                      <Download />
                      Download
                    </a>
                  </DropdownMenuItem>
                ) : null}
                {(canShare || canDownload) && canDelete ? <DropdownMenuSeparator /> : null}
                {canDelete ? (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => onDelete(memory)}
                  >
                    <Trash2 />
                    Delete memory
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-3">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Images className="size-3.5" />
              {memory.source_photo_count} photos
            </span>
            <span className="inline-flex min-w-0 items-center gap-1">
              <Music2 className="size-3.5 shrink-0" />
              <span className="truncate">{memory.music.title}</span>
            </span>
          </div>
          {isFailed && memory.render_error ? (
            <p className="text-xs text-destructive" role="alert">
              {memory.render_error.message}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
