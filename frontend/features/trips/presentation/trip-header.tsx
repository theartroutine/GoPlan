"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, PencilLine } from "lucide-react";

import { bffCancelTrip } from "@/features/trips/infrastructure/trips-api";
import { useTripContext } from "@/features/trips/presentation/trip-context";
import { TripCoverImage } from "@/features/trips/presentation/trip-cover-image";
import { TripStatusBadge } from "@/features/trips/presentation/trip-status-badge";
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

export function TripHeader() {
  const { tripId, data, refresh } = useTripContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (!data) return null;

  const { trip, my_membership, members } = data;
  const isCaptain = my_membership.role === "CAPTAIN";
  const isTerminal = trip.status === "COMPLETED" || trip.status === "CANCELLED";

  async function handleCancel() {
    setCancelLoading(true);
    setCancelError(null);
    try {
      await bffCancelTrip(trip.id);
      setDialogOpen(false);
      await refresh();
    } catch {
      setCancelError("Could not cancel the trip. Please try again.");
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <div>
      {/*
        Outer div: explicit height, relative WITHOUT overflow-hidden so
        bottom overlay elements can translate past the edge.
        The image clips inside its own inner container.
      */}
      <div className="relative h-56 sm:h-64 lg:h-72">
        {/* Image layer */}
        <div className="absolute inset-0 overflow-hidden">
          <TripCoverImage
            coverUrl={trip.cover_image_url}
            alt={`${trip.name} cover`}
            fill
            loading="eager"
            fetchPriority="high"
            className="object-cover"
            unoptimized
          />
          {/* Gradient at the bottom to ease the transition */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background/35 to-transparent" />
        </div>

        {/* ── Status badge — bottom-left, crosses the edge ── */}
        <div className="absolute bottom-0 left-5 z-10 translate-y-1/2">
          <TripStatusBadge
            status={trip.status}
            style={{ boxShadow: "0 0 0 6px var(--background)" }}
          />
        </div>

        {/* ── Captain action pills — bottom-right, crosses the edge ── */}
        {isCaptain && (
          <div
            className="absolute bottom-0 right-5 z-10 flex translate-y-1/2 items-center gap-2"
            style={{ filter: "drop-shadow(0 0 0 6px var(--background))" }}
          >
            {/* Edit trip */}
            <Link
              href={`/trips/${tripId}/edit`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-3 py-1 text-xs font-semibold text-foreground/80 shadow-[0_0_0_4px_var(--background)] transition-colors hover:border-foreground/30 hover:bg-muted hover:text-foreground"
            >
              <PencilLine className="size-3" />
              Edit trip
            </Link>

            {/* Cancel trip */}
            {!isTerminal && (
              <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <AlertDialogTrigger asChild>
                  <button className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-rose-200/90 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 shadow-[0_0_0_4px_var(--background)] transition-colors hover:border-rose-300 hover:bg-rose-100">
                    <span className="size-1.5 rounded-full bg-rose-400" />
                    Cancel trip
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this trip?</AlertDialogTitle>
                    <AlertDialogDescription>
                      All {members.length} member{members.length !== 1 ? "s" : ""} will be
                      notified. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {cancelError && (
                    <p className="text-sm text-destructive">{cancelError}</p>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel size="sm" disabled={cancelLoading}>
                      Keep trip
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      size="sm"
                      disabled={cancelLoading}
                      onClick={() => void handleCancel()}
                    >
                      {cancelLoading ? "Cancelling…" : "Yes, cancel"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>

      {/* ── Trip name + destination ── */}
      {/* pt-6 gives breathing room above the badges that cross into this area */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="truncate text-xl font-bold leading-tight sm:text-2xl">
          {trip.name}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{trip.destination}</span>
        </p>
      </div>
    </div>
  );
}
