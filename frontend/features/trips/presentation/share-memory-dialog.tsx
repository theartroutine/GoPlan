"use client";

import { Copy, Loader2, Share2, Unlink } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  TripMemoryShare,
  TripMemoryVideo,
} from "@/features/trips/domain/memory-types";
import { getTripMemoryErrorMessage } from "@/features/trips/domain/memory-errors";
import {
  bffDisableTripMemoryShareLink,
  bffEnableTripMemoryShareLink,
} from "@/features/trips/infrastructure/memories-api";
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
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

type ShareMemoryDialogProps = {
  memory: TripMemoryVideo;
  tripId: string;
  onClose: () => void;
  onShareChanged: (share: TripMemoryShare) => void;
};

const SHARE_ERROR = "Could not update public share link.";
const COPY_ERROR = "Could not copy link.";
const NATIVE_SHARE_ERROR = "Could not share link.";

type NavigatorWithShare = Navigator & {
  share?: (data: ShareData) => Promise<void>;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function ShareMemoryDialog({
  memory,
  tripId,
  onClose,
  onShareChanged,
}: ShareMemoryDialogProps) {
  const [share, setShare] = useState(memory.share);
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canNativeShare =
    share.enabled && !!share.url && typeof (navigator as NavigatorWithShare).share === "function";

  useEffect(() => {
    setShare(memory.share);
    setMessage(null);
  }, [memory]);

  async function handleEnable() {
    setBusy(true);
    setMessage(null);
    try {
      const nextShare = await bffEnableTripMemoryShareLink(tripId, memory.id);
      setShare(nextShare);
      onShareChanged(nextShare);
      setConfirmEnable(false);
    } catch (err) {
      setMessage(getTripMemoryErrorMessage(err, SHARE_ERROR));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setMessage(null);
    try {
      const nextShare = await bffDisableTripMemoryShareLink(tripId, memory.id);
      setShare(nextShare);
      onShareChanged(nextShare);
    } catch (err) {
      setMessage(getTripMemoryErrorMessage(err, SHARE_ERROR));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!share.url) return;
    try {
      await navigator.clipboard?.writeText(share.url);
      setMessage("Link copied.");
    } catch {
      setMessage(COPY_ERROR);
    }
  }

  async function handleNativeShare() {
    if (!share.url || !canNativeShare) return;
    try {
      await (navigator as NavigatorWithShare).share?.({
        title: memory.title || "Trip memory",
        url: share.url,
      });
    } catch (error) {
      if (!isAbortError(error)) setMessage(NATIVE_SHARE_ERROR);
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => {
        if (!open) onClose();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share memory</DialogTitle>
            <DialogDescription>
              Manage the public link for this memory video.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {message ? (
              <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                {message}
              </div>
            ) : null}

            {share.enabled && share.url ? (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm break-all">
                  {share.url}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void handleCopy()}>
                    <Copy />
                    Copy link
                  </Button>
                  {canNativeShare ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleNativeShare()}
                    >
                      <Share2 />
                      Share
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void handleDisable()}
                  >
                    {busy ? <Loader2 className="animate-spin" /> : <Unlink />}
                    Disable link
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                disabled={busy}
                onClick={() => setConfirmEnable(true)}
              >
                <Share2 />
                Enable public link
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmEnable} onOpenChange={setConfirmEnable}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Enable public link?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone with the link can view this memory video.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void handleEnable();
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              Confirm enable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
