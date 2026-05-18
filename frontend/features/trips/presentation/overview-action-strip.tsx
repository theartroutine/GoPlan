"use client";

import Link from "next/link";
import { useState } from "react";
import { PencilLine } from "lucide-react";

import { bffCancelTrip } from "@/features/trips/infrastructure/trips-api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";

type Props = {
  tripId: string;
  isCaptain: boolean;
  isTerminal: boolean;
  memberCount: number;
  onCancelled: () => Promise<void>;
};

export function OverviewActionStrip({
  tripId,
  isCaptain,
  isTerminal,
  memberCount,
  onCancelled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isCaptain) return null;

  async function handleCancel() {
    setLoading(true);
    setError(null);
    try {
      await bffCancelTrip(tripId);
      setOpen(false);
      await onCancelled();
    } catch {
      setError("Could not cancel the trip. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2 px-4 py-3 sm:px-6">
      <Link
        href={`/trips/${tripId}/edit`}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs font-semibold text-foreground/80 transition-colors hover:border-foreground/30 hover:bg-muted hover:text-foreground"
      >
        <PencilLine aria-hidden="true" className="size-3" />
        Edit trip
      </Link>

      {!isTerminal && (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-rose-200/90 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-100"
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-rose-400" />
              Cancel trip
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this trip?</AlertDialogTitle>
              <AlertDialogDescription>
                All {memberCount} member{memberCount !== 1 ? "s" : ""} will be
                notified. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel size="sm" disabled={loading}>
                Keep trip
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                size="sm"
                disabled={loading}
                onClick={() => void handleCancel()}
              >
                {loading ? "Cancelling…" : "Yes, cancel"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
