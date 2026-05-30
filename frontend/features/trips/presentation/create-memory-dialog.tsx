"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
  MemoryMusicTrack,
  TripMemorySourceMode,
  TripMemoryVideo,
} from "@/features/trips/domain/memory-types";
import { getTripMemoryErrorMessage } from "@/features/trips/domain/memory-errors";
import {
  bffCreateTripMemory,
  bffListMemoryMusicTracks,
} from "@/features/trips/infrastructure/memories-api";
import { MemoryPhotoPicker } from "@/features/trips/presentation/memory-photo-picker";
import { MusicTrackPicker } from "@/features/trips/presentation/music-track-picker";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

type CreateMemoryDialogProps = {
  open: boolean;
  tripId: string;
  onCreated: (memory: TripMemoryVideo) => void;
  onOpenChange: (open: boolean) => void;
};

const CREATE_ERROR = "Could not create memory video.";
const NO_MUSIC_ERROR = "No music available.";

function validateManualSelection(photoIds: string[]): string | null {
  if (photoIds.length < 5 || photoIds.length > 50) {
    return "Select between 5 and 50 photos.";
  }
  return null;
}

export function CreateMemoryDialog({
  open,
  tripId,
  onCreated,
  onOpenChange,
}: CreateMemoryDialogProps) {
  const [title, setTitle] = useState("");
  const [sourceMode, setSourceMode] = useState<TripMemorySourceMode>("manual");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [tracks, setTracks] = useState<MemoryMusicTrack[]>([]);
  const [tracksLoaded, setTracksLoaded] = useState(false);
  // Null means "no explicit choice yet" — the effective key falls back to the
  // first available track so the dialog never submits a silent placeholder.
  const [musicKey, setMusicKey] = useState<string | null>(null);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The in-flight tracks request, so a submit fired before the catalog loads
  // can await it and use the resolved track instead of a stale value.
  const tracksPromiseRef = useRef<Promise<MemoryMusicTrack[]> | null>(null);

  const effectiveMusicKey = musicKey ?? tracks[0]?.key ?? null;

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setLoadingTracks(true);
    setTracksLoaded(false);
    setError(null);

    const request = bffListMemoryMusicTracks(tripId, { signal: controller.signal });
    tracksPromiseRef.current = request;

    void request
      .then((loadedTracks) => {
        if (controller.signal.aborted) return;
        setTracks(loadedTracks);
        setTracksLoaded(true);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(getTripMemoryErrorMessage(err, "Could not load music tracks."));
          setTracks([]);
          setTracksLoaded(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingTracks(false);
      });

    return () => {
      controller.abort();
    };
  }, [open, tripId]);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setSourceMode("manual");
      setSelectedPhotoIds([]);
      setTracks([]);
      setTracksLoaded(false);
      setMusicKey(null);
      setError(null);
      setSubmitting(false);
      tracksPromiseRef.current = null;
    }
  }, [open]);

  async function resolveMusicKey(): Promise<string | null> {
    if (musicKey) return musicKey;
    if (tracks.length > 0) return tracks[0].key;
    // Catalog may still be loading when the user clicks create; wait for it.
    if (tracksPromiseRef.current) {
      try {
        const loaded = await tracksPromiseRef.current;
        return loaded[0]?.key ?? null;
      } catch {
        return null;
      }
    }
    return null;
  }

  async function handleSubmit() {
    if (submitting) return;

    setError(null);
    if (sourceMode === "manual") {
      const validationError = validateManualSelection(selectedPhotoIds);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setSubmitting(true);
    try {
      const resolvedMusicKey = await resolveMusicKey();
      if (!resolvedMusicKey) {
        setError(NO_MUSIC_ERROR);
        return;
      }

      const memory = await bffCreateTripMemory(tripId, {
        source_mode: sourceMode,
        ...(sourceMode === "manual" ? { photo_ids: selectedPhotoIds } : {}),
        music_key: resolvedMusicKey,
        title: title.trim(),
      });
      onCreated(memory);
      onOpenChange(false);
    } catch (err) {
      setError(getTripMemoryErrorMessage(err, CREATE_ERROR));
    } finally {
      setSubmitting(false);
    }
  }

  const noMusicAvailable = tracksLoaded && tracks.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create memory</DialogTitle>
          <DialogDescription>
            Build a private trip video from selected photos or let GoPlan pick them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Title</span>
            <input
              className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={title}
              maxLength={120}
              disabled={submitting}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium">Source</p>
            <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
              {(["manual", "auto"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={sourceMode === mode}
                  disabled={submitting}
                  onClick={() => setSourceMode(mode)}
                  className="rounded-md px-3 py-2 text-sm font-medium transition-colors aria-pressed:bg-background aria-pressed:shadow-xs disabled:opacity-50"
                >
                  {mode === "manual" ? "Manual" : "Auto"}
                </button>
              ))}
            </div>
          </div>

          {sourceMode === "manual" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Photos</p>
                <p className="text-xs text-muted-foreground">
                  {selectedPhotoIds.length}/50 selected
                </p>
              </div>
              <MemoryPhotoPicker
                tripId={tripId}
                selectedIds={selectedPhotoIds}
                disabled={submitting}
                onSelectionChange={setSelectedPhotoIds}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-medium">Music</p>
            <MusicTrackPicker
              tracks={tracks}
              selectedKey={effectiveMusicKey ?? ""}
              loading={loadingTracks}
              disabled={submitting}
              onSelect={setMusicKey}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={submitting || noMusicAvailable}
            onClick={() => void handleSubmit()}
          >
            {submitting ? <Loader2 className="animate-spin" /> : null}
            Create memory
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
