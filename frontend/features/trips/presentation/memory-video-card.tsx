"use client";

import {
  Clock3,
  Download,
  Film,
  Loader2,
  Play,
  Share2,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";
import { Button } from "@/shared/ui/button";

type MemoryVideoCardProps = {
  memory: TripMemoryVideo;
  onDelete: (memory: TripMemoryVideo) => void;
  onPlay: (memory: TripMemoryVideo) => void;
  onShare: (memory: TripMemoryVideo) => void;
};

const STATUS_LABELS = {
  failed: "Render failed",
  queued: "Queued",
  ready: "Ready",
  rendering: "Rendering",
} as const;

function StatusIcon({ status }: { status: TripMemoryVideo["status"] }) {
  if (status === "failed") return <TriangleAlert className="text-destructive" />;
  if (status === "ready") return <Film />;
  if (status === "rendering") return <Loader2 className="animate-spin" />;
  return <Clock3 />;
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
  const title = memory.title.trim() || "Untitled memory";
  const duration = formatDuration(memory.duration_seconds);
  const canDelete = memory.can_manage && (memory.status === "ready" || memory.status === "failed");

  return (
    <article
      className="rounded-lg border bg-card p-4 text-card-foreground shadow-xs"
      data-testid={`memory-card-${memory.id}`}
    >
      <div className="flex gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <StatusIcon status={memory.status} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">
                {memory.source_photo_count} photos
                {duration ? ` · ${duration}` : ""}
              </p>
            </div>
            <span className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted-foreground">
              {STATUS_LABELS[memory.status]}
            </span>
          </div>

          {memory.status === "failed" && memory.render_error ? (
            <p className="text-sm text-destructive" role="alert">
              {memory.render_error.message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {memory.status === "ready" ? (
              <Button type="button" size="sm" onClick={() => onPlay(memory)}>
                <Play />
                Play memory
              </Button>
            ) : null}
            {memory.status === "ready" && memory.can_download ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Download className="size-3" />
                Download available
              </span>
            ) : null}
            {memory.status === "ready" && memory.can_manage ? (
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
