"use client";

import Link from "next/link";
import { useState } from "react";

import type { TripStatus } from "@/features/trips/domain/types";
import {
  bffCancelTrip,
  bffCompleteTrip,
  bffStartTrip,
} from "@/features/trips/infrastructure/trips-api";
import { useTripContext } from "@/features/trips/presentation/trip-context";
import { Button } from "@/shared/ui/button";

// -------- Status Progress Bar --------

const STATUS_STEPS: { key: TripStatus; label: string }[] = [
  { key: "PLANNING", label: "Planning" },
  { key: "ONGOING", label: "Ongoing" },
  { key: "COMPLETED", label: "Completed" },
];

const STATUS_ORDER: Record<TripStatus, number> = {
  PLANNING: 0,
  ONGOING: 1,
  COMPLETED: 2,
  CANCELLED: -1,
};

function StatusProgressBar({ status }: { status: TripStatus }) {
  if (status === "CANCELLED") {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
        Trip Cancelled
      </div>
    );
  }

  const currentIdx = STATUS_STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex items-start">
      {STATUS_STEPS.map((step, i) => {
        const isPast = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={step.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {i > 0 && (
                <div
                  className={`h-0.5 flex-1 ${isPast || isCurrent ? "bg-primary" : "bg-border"}`}
                />
              )}
              <div
                className={`h-3 w-3 shrink-0 rounded-full border-2 ${
                  isPast
                    ? "border-primary bg-primary"
                    : isCurrent
                      ? "border-primary bg-background ring-2 ring-primary/20"
                      : "border-muted-foreground/30 bg-background"
                }`}
              />
              {i < STATUS_STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 ${isPast ? "bg-primary" : "bg-border"}`}
                />
              )}
            </div>
            <span
              className={`mt-1 text-xs ${isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// -------- Overview Tab --------

export function OverviewTab() {
  const { tripId, data, refresh } = useTripContext();
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!data) return null;

  const { trip, my_membership, members } = data;
  const isCaptain = my_membership.role === "CAPTAIN";
  const isTerminal = trip.status === "COMPLETED" || trip.status === "CANCELLED";

  const days =
    Math.ceil(
      (new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1;

  const budgetPerPerson =
    trip.budget_estimate && members.length > 0
      ? (parseFloat(trip.budget_estimate) / members.length).toLocaleString("vi-VN")
      : null;

  async function runAction(action: () => Promise<void>, errMsg: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      await action();
      await refresh();
    } catch {
      setActionError(errMsg);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {isCaptain && (
        <div className="flex justify-end">
          <Link
            href={`/trips/${tripId}/edit`}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ✏ Edit Trip
          </Link>
        </div>
      )}

      {trip.description && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Description
          </h2>
          <p className="text-sm leading-relaxed">{trip.description}</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Trip Details
        </h2>
        <div className="space-y-1 text-sm">
          <p>
            📅 {trip.start_date} – {trip.end_date}{" "}
            <span className="text-muted-foreground">({days} days)</span>
          </p>
          <p>
            👥{" "}
            <span className="font-medium">
              {members.length} member{members.length !== 1 ? "s" : ""}
            </span>{" "}
            ·{" "}
            <Link
              href={`/trips/${tripId}/members`}
              className="text-primary hover:underline"
            >
              View members
            </Link>
          </p>
        </div>
      </div>

      {trip.budget_estimate && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Budget
          </h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-medium">
                {parseFloat(trip.budget_estimate).toLocaleString("vi-VN")}{" "}
                {trip.currency_code}
              </span>
            </div>
            {budgetPerPerson && (
              <div>
                <span className="text-muted-foreground">Per person: </span>
                <span className="font-medium">
                  ~{budgetPerPerson} {trip.currency_code}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Status
        </h2>
        <StatusProgressBar status={trip.status} />

        {isCaptain && !isTerminal && (
          <div className="mt-4 space-y-2">
            {actionError && (
              <p className="text-sm text-destructive">{actionError}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {trip.status === "PLANNING" && (
                <Button
                  size="sm"
                  disabled={actionLoading}
                  onClick={() =>
                    void runAction(
                      () => bffStartTrip(trip.id),
                      "Could not start trip.",
                    )
                  }
                >
                  Start Trip
                </Button>
              )}
              {trip.status === "ONGOING" && (
                <Button
                  size="sm"
                  disabled={actionLoading}
                  onClick={() =>
                    void runAction(
                      () => bffCompleteTrip(trip.id),
                      "Could not complete trip.",
                    )
                  }
                >
                  Complete Trip
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                disabled={actionLoading}
                onClick={() =>
                  void runAction(
                    () => bffCancelTrip(trip.id),
                    "Could not cancel trip.",
                  )
                }
              >
                Cancel Trip
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
