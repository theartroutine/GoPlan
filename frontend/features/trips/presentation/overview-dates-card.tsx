import { Cloud, Compass, MapPin, Mountain, Plane, Sun } from "lucide-react";

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
      return "border-sky-200/80 bg-white/80 text-sky-700 backdrop-blur-sm";
    case "in_progress":
      return "border-emerald-200/80 bg-white/80 text-emerald-700 backdrop-blur-sm";
    case "past":
      return "border-slate-200/80 bg-white/80 text-slate-600 backdrop-blur-sm";
    case "cancelled":
      return "border-rose-200/80 bg-white/80 text-rose-700 backdrop-blur-sm";
  }
}

function leafTone(state: TripCountdownState): string {
  switch (state.kind) {
    case "future":
      return "bg-sky-500";
    case "in_progress":
      return "bg-emerald-500";
    case "past":
      return "bg-slate-500";
    case "cancelled":
      return "bg-rose-500";
  }
}

function JourneyPattern() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* dashed flight arc */}
      <svg
        className="absolute -right-6 -top-3 size-32 text-sky-400/30"
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2 3"
      >
        <path d="M5 80 Q 50 -10 95 60" />
      </svg>
      <Plane className="absolute right-3 top-3 size-7 -rotate-[25deg] text-sky-500/35" />
      <Sun className="absolute left-3 top-3 size-8 text-amber-400/35" />
      <Cloud className="absolute left-1/2 top-2 size-6 -translate-x-1/2 text-sky-300/30" />
      <Mountain className="absolute -bottom-1 right-2 size-12 text-indigo-400/25" />
      <Compass className="absolute -bottom-1 left-2 size-9 -rotate-12 text-amber-500/25" />
      <MapPin className="absolute bottom-3 left-1/2 size-4 text-rose-400/30" />
    </div>
  );
}

function CalendarLeaf({
  month,
  day,
  tone,
}: {
  month: string;
  day: number;
  tone: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="relative shrink-0 w-16 overflow-hidden rounded-xl border border-border bg-card shadow-md ring-1 ring-white/60"
    >
      <div className={cn("px-2 py-1 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-white", tone)}>
        {month}
      </div>
      <div className="flex items-center justify-center bg-card py-2.5">
        <div className="text-[28px] font-bold leading-none tracking-tight text-foreground">
          {day}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-[18px] flex justify-between px-2">
        <span className="size-1 rounded-full bg-background ring-1 ring-border" />
        <span className="size-1 rounded-full bg-background ring-1 ring-border" />
      </div>
    </div>
  );
}

function getStartDay(start: string): number {
  return Number.parseInt(start.split("-")[2] ?? "1", 10);
}

export function OverviewDatesCard({ start, end, status, today }: Props) {
  const dateRange = `${formatDateOnly(start, { month: "short", day: "numeric" })} – ${formatDateOnly(end, { month: "short", day: "numeric", year: "numeric" })}`;
  const days = getInclusiveDateOnlySpan(start, end);
  const state = getTripCountdownState({ start, end, status, today });
  const month = formatDateOnly(start, { month: "short" }).toUpperCase();
  const day = getStartDay(start);

  return (
    <div className="relative h-full overflow-hidden rounded-[inherit] bg-gradient-to-br from-sky-50 via-white to-amber-50/70">
      <JourneyPattern />

      <div className="relative flex items-center gap-4 p-4 sm:p-5">
        <CalendarLeaf month={month} day={day} tone={leafTone(state)} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-0.5">
            <p className="truncate text-base font-semibold leading-tight text-foreground">
              {dateRange}
            </p>
            <p className="text-xs text-muted-foreground">
              {days} {pluralizeDays(days)}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium shadow-sm",
              countdownTone(state),
            )}
          >
            {countdownLabel(state)}
          </span>
        </div>
      </div>
    </div>
  );
}
