"use client";

import { Fragment, useState } from "react";
import Link from "next/link";

import type { TripStatus } from "@/features/trips/domain/types";
import { bffCancelTrip } from "@/features/trips/infrastructure/trips-api";
import { useTripContext } from "@/features/trips/presentation/trip-context";
import { Button } from "@/shared/ui/button";

// -------- Status Progress Bar --------

const STATUS_STEPS: { key: TripStatus; label: string }[] = [
  { key: "PLANNING", label: "Planning" },
  { key: "ONGOING", label: "Ongoing" },
  { key: "COMPLETED", label: "Completed" },
];

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
    <div>
      <div className="flex items-center">
        {STATUS_STEPS.map((step, i) => {
          const isPast = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <Fragment key={step.key}>
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
            </Fragment>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        {STATUS_STEPS.map((step, i) => (
          <span
            key={step.key}
            className={i === currentIdx ? "font-semibold text-foreground" : "text-muted-foreground"}
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// -------- Overview Tab --------

export function OverviewTab() {
  const { tripId, data, refresh } = useTripContext();
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

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

  async function handleCancel() {
    setCancelLoading(true);
    setCancelError(null);
    try {
      await bffCancelTrip(trip.id);
      await refresh();
    } catch {
      setCancelError("Could not cancel trip.");
    } finally {
      setCancelLoading(false);
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
      </div>

      {isCaptain && !isTerminal && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive/60">
            Danger Zone
          </h2>
          {cancelError && (
            <p className="mb-2 text-sm text-destructive">{cancelError}</p>
          )}
          <Button
            size="sm"
            variant="destructive"
            disabled={cancelLoading}
            onClick={() => void handleCancel()}
          >
            {cancelLoading ? "Cancelling…" : "Cancel Trip"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            This will cancel the trip for all members.
          </p>
        </div>
      )}
    </div>
  );
}
