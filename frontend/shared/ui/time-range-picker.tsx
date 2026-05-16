"use client";

import { Calendar } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/shared/ui/input";

export type TimeRangePreset = { label: string; start: string; end: string };

export type TimeRangeValue = { start: string | null; end: string | null };

type Props = {
  sectionIndex: number;
  sectionDate: string; // YYYY-MM-DD
  tripTimezone: string;
  value: TimeRangeValue;
  onChange: (next: { start: string; end: string }) => void;
  onError?: (error: string | null) => void;
  presets?: TimeRangePreset[];
  disabled?: boolean;
};

function formatDayLabel(dateIso: string, timezone: string): string {
  try {
    const dt = new Date(`${dateIso}T00:00:00`);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "2-digit",
      timeZone: timezone,
    }).format(dt);
  } catch {
    return dateIso;
  }
}

export function TimeRangePicker({
  sectionIndex,
  sectionDate,
  tripTimezone,
  value,
  onChange,
  onError,
  presets = [],
  disabled,
}: Props) {
  const [start, setStart] = useState(value.start ?? "");
  const [end, setEnd] = useState(value.end ?? "");

  const dayLabel = useMemo(
    () => `Day ${sectionIndex} · ${formatDayLabel(sectionDate, tripTimezone)}`,
    [sectionIndex, sectionDate, tripTimezone],
  );

  const error = useMemo(() => {
    if (!start || !end) return null;
    if (start >= end) return "End time must be after start time.";
    return null;
  }, [start, end]);

  useEffect(() => {
    onError?.(error);
  }, [error, onError]);

  function commit(nextStart: string, nextEnd: string) {
    setStart(nextStart);
    setEnd(nextEnd);
    if (nextStart && nextEnd && nextStart < nextEnd) {
      onChange({ start: nextStart, end: nextEnd });
    }
  }

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
        <Calendar className="size-3" aria-hidden />
        {dayLabel}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">Starts at</span>
          <Input
            type="time"
            value={start}
            disabled={disabled}
            onChange={(e) => commit(e.target.value, end)}
          />
        </label>
        <label className="block space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">Ends at</span>
          <Input
            type="time"
            value={end}
            disabled={disabled}
            className={error ? "border-destructive" : undefined}
            onChange={(e) => commit(start, e.target.value)}
          />
        </label>
      </div>
      {presets.length ? (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={disabled}
              onClick={() => commit(p.start, p.end)}
              className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground hover:bg-accent disabled:opacity-50"
            >
              {p.label} {p.start}–{p.end}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
