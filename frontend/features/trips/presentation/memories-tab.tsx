"use client";

import { Film, Loader2, Plus, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  TripMemoryShare,
  TripMemoryVideo,
} from "@/features/trips/domain/memory-types";
import { getTripMemoryErrorMessage } from "@/features/trips/domain/memory-errors";
import {
  bffDeleteTripMemory,
  bffListTripMemories,
  bffListTripMemoryStatuses,
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

const LOAD_ERROR = "Could not load trip memories.";
const DELETE_ERROR = "Could not delete this memory video.";
const POLL_INTERVAL_MS = 15_000;
const POLL_BACKOFF_AFTER_MS = 10 * 60_000;
const POLL_BACKOFF_INTERVAL_MS = 60_000;
const POLL_STOP_AFTER_MS = 30 * 60_000;
const LOADING_SKELETON_KEYS = ["primary", "secondary", "tertiary"] as const;

type MemoryPollState = {
  firstSeenAt: number;
  lastPolledAt: number;
  updatedAt: string;
};

function hasInProgressMemory(memories: TripMemoryVideo[]): boolean {
  return memories.some(
    (memory) => memory.status === "queued" || memory.status === "rendering",
  );
}

function inProgressMemoryIds(memories: TripMemoryVideo[]): string[] {
  return memories
    .filter((memory) => memory.status === "queued" || memory.status === "rendering")
    .map((memory) => memory.id);
}

function MemoryLoadingSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
    >
      <span className="sr-only">Loading memories</span>
      {LOADING_SKELETON_KEYS.map((key) => (
        <div
          className="overflow-hidden rounded-lg border border-border bg-card shadow-xs"
          key={key}
        >
          <div className="aspect-video w-full animate-pulse bg-muted" />
          <div className="space-y-2 p-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="flex gap-2">
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </div>
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
  const loadedCursorsRef = useRef<(string | null)[]>([null]);
  const activeMemoryIdsRef = useRef<string[]>([]);
  const activeMemoryPollStateRef = useRef<Map<string, MemoryPollState>>(new Map());
  const pollInFlightRef = useRef(false);
  const hasActiveMemory = hasInProgressMemory(memories);

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
      loadedCursorsRef.current = cursors;
      setLoadedCursors(cursors);
      setNextCursor(pages.at(-1)?.nextCursor ?? null);
    } catch (err) {
      if (!options.signal?.aborted) {
        setError(getTripMemoryErrorMessage(err, LOAD_ERROR));
        if (options.showLoading) setMemories([]);
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
    loadedCursorsRef.current = loadedCursors;
  }, [loadedCursors]);

  useEffect(() => {
    const now = Date.now();
    const activeIds = new Set<string>();
    for (const memory of memories) {
      if (memory.status !== "queued" && memory.status !== "rendering") continue;
      activeIds.add(memory.id);
      const existing = activeMemoryPollStateRef.current.get(memory.id);
      if (!existing || existing.updatedAt !== memory.updated_at) {
        activeMemoryPollStateRef.current.set(memory.id, {
          firstSeenAt: now,
          lastPolledAt: now,
          updatedAt: memory.updated_at,
        });
      }
    }
    for (const memoryId of activeMemoryPollStateRef.current.keys()) {
      if (!activeIds.has(memoryId)) activeMemoryPollStateRef.current.delete(memoryId);
    }
    activeMemoryIdsRef.current = inProgressMemoryIds(memories);
  }, [memories]);

  useEffect(() => {
    if (!hasActiveMemory) return;

    let stopped = false;
    let controller: AbortController | null = null;
    const interval = window.setInterval(() => {
      if (pollInFlightRef.current) return;
      const now = Date.now();
      const ids = activeMemoryIdsRef.current.filter((memoryId) => {
        const state = activeMemoryPollStateRef.current.get(memoryId);
        if (!state) return false;
        const ageMs = now - state.firstSeenAt;
        if (ageMs >= POLL_STOP_AFTER_MS) return false;
        if (ageMs >= POLL_BACKOFF_AFTER_MS) {
          const backoffStartAt = state.firstSeenAt + POLL_BACKOFF_AFTER_MS;
          return (
            now - Math.max(state.lastPolledAt, backoffStartAt) >=
            POLL_BACKOFF_INTERVAL_MS
          );
        }
        return now - state.lastPolledAt >= POLL_INTERVAL_MS;
      }).slice(0, 10);
      if (ids.length === 0) return;
      for (const memoryId of ids) {
        const state = activeMemoryPollStateRef.current.get(memoryId);
        if (state) {
          activeMemoryPollStateRef.current.set(memoryId, {
            ...state,
            lastPolledAt: now,
          });
        }
      }

      pollInFlightRef.current = true;
      controller = new AbortController();
      void bffListTripMemoryStatuses(tripId, ids, {
        signal: controller.signal,
      })
        .then(({ results }) => {
          if (stopped || controller?.signal.aborted || results.length === 0) return;
          const updates = new Map(results.map((memory) => [memory.id, memory]));
          setMemories((current) =>
            current.map((memory) => updates.get(memory.id) ?? memory),
          );
        })
        .catch(() => {
          // Background polling is best-effort. Keep the current list visible on
          // transient network errors or throttles; the next tick can recover.
        })
        .finally(() => {
          pollInFlightRef.current = false;
        });
    }, POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      controller?.abort();
      pollInFlightRef.current = false;
      window.clearInterval(interval);
    };
  }, [hasActiveMemory, tripId]);

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
      const nextLoadedCursors = [...loadedCursorsRef.current, cursor];
      loadedCursorsRef.current = nextLoadedCursors;
      setLoadedCursors(nextLoadedCursors);
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
          <h2 className="sr-only">Memories</h2>
          <p className="text-sm text-muted-foreground">
            {memories.length > 0
              ? `${memories.length} ${memories.length === 1 ? "video" : "videos"} in this trip.`
              : "Create and manage private videos for this trip."}
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus />
          Create memory
        </Button>
      </div>

      {loading ? (
        <MemoryLoadingSkeleton />
      ) : null}

      {!loading && memories.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Film className="size-7" />
          </div>
          <h2 className="text-base font-semibold">No memories yet.</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Turn this trip&apos;s photos into a private highlight video you can share.
          </p>
          <Button type="button" className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus />
            Create memory
          </Button>
        </div>
      ) : null}

      {!loading && memories.length > 0 ? (
        <div className="space-y-4">
          {refreshing ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Refreshing
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {memories.map((memory) => (
              <MemoryVideoCard
                key={memory.id}
                memory={memory}
                onDelete={setMemoryPendingDelete}
                onPlay={setViewerMemory}
                onShare={setShareMemory}
              />
            ))}
          </div>
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
        <DialogContent className="sm:max-w-3xl" showCloseButton={false}>
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
