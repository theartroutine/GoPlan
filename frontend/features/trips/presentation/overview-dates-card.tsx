import { CalendarDays } from "lucide-react";

import {
  formatDateOnly,
  getInclusiveDateOnlySpan,
} from "@/features/trips/domain/date-only";
import {
  getTripCountdownState,
  type TripCountdownState,
} from "@/features/trips/domain/trip-countdown";
import type { TripStatus } from "@/features/trips/domain/types";
import { cn } from "@/shared/lib/utils";

type Props = {
  start: string;
  end: string;
  status: TripStatus;
  today: string;
};

function pluralizeDays(n: number): string {
  return n === 1 ? "day" : "days";
}

function countdownLabel(state: TripCountdownState): string {
  switch (state.kind) {
    case "future":
      return `D-${state.daysUntilStart} ${pluralizeDays(state.daysUntilStart)} to go`;
    case "in_progress":
      return "Trip in progress";
    case "past":
      return `Ended ${state.daysSinceEnd} ${pluralizeDays(state.daysSinceEnd)} ago`;
    case "cancelled":
      return "Trip cancelled";
  }
}

function countdownTone(state: TripCountdownState): string {
  switch (state.kind) {
    case "future":
      return "border-sky-200/80 bg-sky-50 text-sky-700";
    case "in_progress":
      return "border-emerald-200/80 bg-emerald-50 text-emerald-700";
    case "past":
      return "border-slate-200/80 bg-slate-100 text-slate-600";
    case "cancelled":
      return "border-rose-200/80 bg-rose-50 text-rose-700";
  }
}

export function OverviewDatesCard({ start, end, status, today }: Props) {
  const dateRange = `${formatDateOnly(start, { month: "short", day: "numeric" })} – ${formatDateOnly(end, { month: "short", day: "numeric", year: "numeric" })}`;
  const days = getInclusiveDateOnlySpan(start, end);
  const state = getTripCountdownState({ start, end, status, today });

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight">{dateRange}</p>
          <p className="text-xs text-muted-foreground">{days} days</p>
        </div>
      </div>
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
          countdownTone(state),
        )}
      >
        {countdownLabel(state)}
      </span>
    </div>
  );
}
