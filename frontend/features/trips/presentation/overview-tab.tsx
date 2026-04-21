"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, PencilLine, Users, Wallet } from "lucide-react";

import type { TripStatus } from "@/features/trips/domain/types";
import { bffCancelTrip } from "@/features/trips/infrastructure/trips-api";
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
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

// ── Status Journey ────────────────────────────────────────────────────────

const STATUS_STEPS: { key: TripStatus; label: string }[] = [
  { key: "PLANNING", label: "Planning" },
  { key: "ONGOING", label: "Ongoing" },
  { key: "COMPLETED", label: "Completed" },
];

function StatusJourney({ status }: { status: TripStatus }) {
  if (status === "CANCELLED") {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
        <span className="size-2 rounded-full bg-destructive/80" />
        This trip has been cancelled
      </p>
    );
  }

  const currentIdx = STATUS_STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex items-start">
      {STATUS_STEPS.map((step, i) => {
        const isPast = i < currentIdx;
        const isCurrent = i === currentIdx;

        return (
          <Fragment key={step.key}>
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "flex size-5 items-center justify-center rounded-full transition-all duration-300",
                  isPast
                    ? "bg-foreground text-background"
                    : isCurrent
                      ? "border-[1.5px] border-foreground bg-background ring-2 ring-foreground/10"
                      : "border border-border/60 bg-muted",
                )}
              >
                {isPast ? (
                  <Check className="size-3" strokeWidth={2.5} />
                ) : isCurrent ? (
                  <span className="size-1.5 rounded-full bg-foreground" />
                ) : null}
              </div>
              <span
                className={cn(
                  "text-xs font-medium",
                  isCurrent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>

            {i < STATUS_STEPS.length - 1 && (
              <div
                className={cn(
                  "mt-2.5 h-px flex-1 transition-colors duration-500",
                  i < currentIdx ? "bg-foreground/25" : "bg-border/60",
                )}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(d: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(d).toLocaleDateString("en-US", opts ?? {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Overview Tab ──────────────────────────────────────────────────────────

export function OverviewTab() {
  const { tripId, data, refresh } = useTripContext();
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!data) return null;

  const { trip, my_membership, members } = data;
  const isCaptain = my_membership.role === "CAPTAIN";
  const isTerminal = trip.status === "COMPLETED" || trip.status === "CANCELLED";

  const days =
    Math.ceil(
      (new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1;

  const dateRange = `${fmtDate(trip.start_date, { month: "short", day: "numeric" })} – ${fmtDate(trip.end_date)}`;

  const totalBudget = trip.budget_estimate
    ? parseFloat(trip.budget_estimate).toLocaleString("vi-VN")
    : null;

  const budgetPerPerson =
    trip.budget_estimate && members.length > 0
      ? (parseFloat(trip.budget_estimate) / members.length).toLocaleString("vi-VN")
      : null;

  const MAX_AVATARS = 5;
  const visibleMembers = members.slice(0, MAX_AVATARS);
  const extraCount = members.length - MAX_AVATARS;

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
    <div className="divide-y divide-border/50">

      {/* ── Key info ──────────────────────────────────────────────────────── */}
      <div
        className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both pb-6"
        style={{ animationDuration: "0.5s", animationDelay: "0ms" }}
      >
        <div className="space-y-4">

          {/* Dates */}
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{dateRange}</p>
              <p className="text-xs text-muted-foreground">{days} days</p>
            </div>
          </div>

          {/* Members */}
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {members.length} member{members.length !== 1 ? "s" : ""}
              </p>
              <AvatarGroup>
                {visibleMembers.map((m) => (
                  <Avatar key={m.membership_id} size="sm">
                    <AvatarFallback className="text-[10px]">
                      {m.user.display_name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {extraCount > 0 && (
                  <AvatarGroupCount className="text-[10px]">
                    +{extraCount}
                  </AvatarGroupCount>
                )}
              </AvatarGroup>
            </div>
          </div>

          {/* Budget */}
          {totalBudget && (
            <div className="flex items-start gap-3">
              <Wallet className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {totalBudget} {trip.currency_code}
                </p>
                {budgetPerPerson && (
                  <p className="text-xs text-muted-foreground">
                    ~{budgetPerPerson} {trip.currency_code} per person
                  </p>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Status ────────────────────────────────────────────────────────── */}
      <div
        className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both py-6"
        style={{ animationDuration: "0.5s", animationDelay: "80ms" }}
      >
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Status
        </p>
        <StatusJourney status={trip.status} />
      </div>

      {/* ── Description ───────────────────────────────────────────────────── */}
      {trip.description && (
        <div
          className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both py-6"
          style={{ animationDuration: "0.5s", animationDelay: "140ms" }}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            About
          </p>
          <p className="text-sm leading-relaxed text-foreground/75">{trip.description}</p>
        </div>
      )}

      {/* ── Captain actions ────────────────────────────────────────────────── */}
      {isCaptain && (
        <div
          className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both pt-6"
          style={{ animationDuration: "0.5s", animationDelay: "200ms" }}
        >
          <div className="space-y-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-full gap-2"
            >
              <Link href={`/trips/${tripId}/edit`}>
                <PencilLine className="size-3.5" />
                Edit trip
              </Link>
            </Button>

            {!isTerminal && (
              <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/5 hover:text-destructive"
                  >
                    Cancel trip
                  </Button>
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
        </div>
      )}

    </div>
  );
}
