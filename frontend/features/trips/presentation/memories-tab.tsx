"use client";

import { Film, Loader2, Plus, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type {
  TripMemoryShare,
  TripMemoryVideo,
} from "@/features/trips/domain/memory-types";
import { getTripMemoryErrorMessage } from "@/features/trips/domain/memory-errors";
import {
  bffDeleteTripMemory,
  bffListTripMemories,
} from "@/features/trips/infrastructure/memories-api";
import { CreateMemoryDialog } from "@/features/trips/presentation/create-memory-dialog";
import { MemoryVideoCard } from "@/features/trips/presentation/memory-video-card";
import { MemoryVideoViewer } from "@/features/trips/presentation/memory-video-viewer";
import { ShareMemoryDialog } from "@/features/trips/presentation/share-memory-dialog";
import { useTripContext } from "@/features/trips/presentation/trip-context";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Spinner } from "@/shared/ui/spinner";

const LOAD_ERROR = "Could not load trip memories.";
const DELETE_ERROR = "Could not delete this memory video.";
const POLL_INTERVAL_MS = 3_000;

function hasInProgressMemory(memories: TripMemoryVideo[]): boolean {
  return memories.some(
    (memory) => memory.status === "queued" || memory.status === "rendering",
  );
}

export function MemoriesTab() {
  const { tripId } = useTripContext();
  const [memories, setMemories] = useState<TripMemoryVideo[]>([]);
  const [loadedCursors, setLoadedCursors] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewerMemory, setViewerMemory] = useState<TripMemoryVideo | null>(null);
  const [shareMemory, setShareMemory] = useState<TripMemoryVideo | null>(null);
  const [memoryPendingDelete, setMemoryPendingDelete] =
    useState<TripMemoryVideo | null>(null);

  const loadMemories = useCallback(async (
    options: {
      cursors?: (string | null)[];
      signal?: AbortSignal;
      showLoading?: boolean;
      showRefreshing?: boolean;
    } = {},
  ) => {
    const cursors = options.cursors ?? [null];
    if (options.showLoading) setLoading(true);
    if (options.showRefreshing ?? !options.showLoading) setRefreshing(true);
    setError(null);

    try {
      const pages = [];
      for (const cursor of cursors) {
        if (options.signal?.aborted) return;
        pages.push(
          await bffListTripMemories(tripId, {
            cursor: cursor ?? undefined,
            signal: options.signal,
          }),
        );
      }
      if (options.signal?.aborted) return;
      const seen = new Set<string>();
      const results = pages.flatMap((page) => page.results).filter((memory) => {
        if (seen.has(memory.id)) return false;
        seen.add(memory.id);
        return true;
      });
      setMemories(results);
      setLoadedCursors(cursors);
      setNextCursor(pages.at(-1)?.nextCursor ?? null);
    } catch (err) {
      if (!options.signal?.aborted) {
        setError(getTripMemoryErrorMessage(err, LOAD_ERROR));
        setMemories([]);
      }
    } finally {
      if (!options.signal?.aborted) {
        if (options.showLoading) setLoading(false);
        if (options.showRefreshing ?? !options.showLoading) setRefreshing(false);
      }
    }
  }, [tripId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadMemories({ signal: controller.signal, showLoading: true });
    return () => {
      controller.abort();
    };
  }, [loadMemories]);

  useEffect(() => {
    if (!hasInProgressMemory(memories)) return;

    const interval = window.setInterval(() => {
      void loadMemories({ cursors: loadedCursors });
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadMemories, loadedCursors, memories]);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    const cursor = nextCursor;
    setLoadingMore(true);
    setError(null);

    try {
      const page = await bffListTripMemories(tripId, { cursor });
      setMemories((current) => {
        const seen = new Set(current.map((memory) => memory.id));
        return [
          ...current,
          ...page.results.filter((memory) => {
            if (seen.has(memory.id)) return false;
            seen.add(memory.id);
            return true;
          }),
        ];
      });
      setLoadedCursors((current) => [...current, cursor]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(getTripMemoryErrorMessage(err, LOAD_ERROR));
    } finally {
      setLoadingMore(false);
    }
  }

  function handleCreated(memory: TripMemoryVideo) {
    setMemories((current) => [memory, ...current.filter((item) => item.id !== memory.id)]);
    setCreateOpen(false);
  }

  function handleShareChanged(memoryId: string, share: TripMemoryShare) {
    setMemories((current) =>
      current.map((memory) =>
        memory.id === memoryId ? { ...memory, share } : memory,
      ),
    );
    setShareMemory((current) =>
      current?.id === memoryId ? { ...current, share } : current,
    );
  }

  async function handleConfirmDelete() {
    if (!memoryPendingDelete || deleting) return;
    const memory = memoryPendingDelete;
    setDeleting(true);
    setDeleteError(null);

    try {
      await bffDeleteTripMemory(tripId, memory.id);
      setMemories((current) => current.filter((item) => item.id !== memory.id));
      setMemoryPendingDelete(null);
      if (viewerMemory?.id === memory.id) setViewerMemory(null);
      if (shareMemory?.id === memory.id) setShareMemory(null);
    } catch (err) {
      setDeleteError(getTripMemoryErrorMessage(err, DELETE_ERROR));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {deleteError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {deleteError}
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadMemories()}>
            <RefreshCcw />
            Retry
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            Create and manage private videos for this trip.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus />
          Create memory
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : null}

      {!loading && memories.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
          <Film className="mb-3 size-10 text-muted-foreground" />
          <h2 className="text-base font-semibold">No memories yet.</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Create the first memory video from this trip.
          </p>
          <Button type="button" className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus />
            Create memory
          </Button>
        </div>
      ) : null}

      {!loading && memories.length > 0 ? (
        <div className="space-y-3">
          {refreshing ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Refreshing
            </div>
          ) : null}
          {memories.map((memory) => (
            <MemoryVideoCard
              key={memory.id}
              memory={memory}
              onDelete={setMemoryPendingDelete}
              onPlay={setViewerMemory}
              onShare={setShareMemory}
            />
          ))}
          {nextCursor ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore}
                onClick={() => void handleLoadMore()}
              >
                {loadingMore ? <Loader2 className="animate-spin" /> : null}
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <CreateMemoryDialog
        tripId={tripId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      <Dialog
        open={viewerMemory !== null}
        onOpenChange={(open) => {
          if (!open) setViewerMemory(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle className="sr-only">Memory video viewer</DialogTitle>
          <DialogDescription className="sr-only">
            Watch the selected trip memory video.
          </DialogDescription>
          {viewerMemory ? (
            <MemoryVideoViewer
              tripId={tripId}
              memory={viewerMemory}
              onClose={() => setViewerMemory(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {shareMemory ? (
        <ShareMemoryDialog
          tripId={tripId}
          memory={shareMemory}
          onClose={() => setShareMemory(null)}
          onShareChanged={(share) => handleShareChanged(shareMemory.id, share)}
        />
      ) : null}

      <AlertDialog
        open={memoryPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setMemoryPendingDelete(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete memory?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the private rendered video from the trip.
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
              Delete memory
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
