"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  MemoryPhotoLimits,
  TripMemorySourceMode,
  TripMemoryVideo,
} from "@/features/trips/domain/memory-types";
import { getTripMemoryErrorMessage } from "@/features/trips/domain/memory-errors";
import {
  bffCreateTripMemory,
  bffGetTripMemoryCreateOptions,
} from "@/features/trips/infrastructure/memories-api";
import { MemoryPhotoPicker } from "@/features/trips/presentation/memory-photo-picker";
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
const OPTIONS_ERROR = "Could not load memory options.";

function validateManualSelection(
  photoIds: string[],
  photoLimits: MemoryPhotoLimits,
): string | null {
  if (photoIds.length < photoLimits.min || photoIds.length > photoLimits.max) {
    return `Select between ${photoLimits.min} and ${photoLimits.max} photos.`;
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
  const [photoLimits, setPhotoLimits] = useState<MemoryPhotoLimits | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setSourceMode("manual");
      setSelectedPhotoIds([]);
      setPhotoLimits(null);
      setError(null);
      setOptionsError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const controller = new AbortController();
    void bffGetTripMemoryCreateOptions(tripId, { signal: controller.signal })
      .then((options) => {
        if (controller.signal.aborted) return;
        setPhotoLimits(options.photo_limits);
        setOptionsError(null);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPhotoLimits(null);
          setOptionsError(OPTIONS_ERROR);
        }
      });

    return () => {
      controller.abort();
    };
  }, [open, tripId]);

  async function handleSubmit() {
    if (submitting) return;

    setError(null);
    if (sourceMode === "manual") {
      if (!photoLimits) {
        setError(OPTIONS_ERROR);
        return;
      }
      const validationError = validateManualSelection(selectedPhotoIds, photoLimits);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setSubmitting(true);
    try {
      const memory = await bffCreateTripMemory(tripId, {
        source_mode: sourceMode,
        ...(sourceMode === "manual" ? { photo_ids: selectedPhotoIds } : {}),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
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

          {optionsError ? (
            <div className="rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {optionsError}
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
                  {photoLimits
                    ? `${selectedPhotoIds.length}/${photoLimits.max} selected`
                    : `${selectedPhotoIds.length} selected`}
                </p>
              </div>
              <MemoryPhotoPicker
                tripId={tripId}
                selectedIds={selectedPhotoIds}
                maxSelectable={photoLimits?.max ?? 0}
                disabled={submitting || !photoLimits}
                onSelectionChange={setSelectedPhotoIds}
              />
            </div>
          ) : null}

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
            disabled={submitting || (sourceMode === "manual" && !photoLimits)}
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
