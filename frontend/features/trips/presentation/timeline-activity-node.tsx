"use client";

import { Clock, MapPin } from "lucide-react";

import type { TimelineActivity } from "@/features/trips/domain/types";

function formatTimeRange(activity: TimelineActivity): string {
  if (activity.time_mode === "ALL_DAY") return "All day";
  const start = activity.start_time?.slice(0, 5) ?? "";
  if (activity.time_mode === "AT_TIME") return start;
  const end = activity.end_time?.slice(0, 5) ?? "";
  return start && end ? `${start} – ${end}` : start || end;
}

const STATUS_TONE: Record<TimelineActivity["status"], string> = {
  UPCOMING: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-sky-100 text-sky-900",
  DONE: "bg-emerald-100 text-emerald-900",
  CANCELLED: "bg-rose-100 text-rose-900",
};

export function TimelineActivityNode({ activity }: { activity: TimelineActivity }) {
  const timeText = formatTimeRange(activity);
  const typeLabel = activity.activity_type?.label ?? null;

  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{activity.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {timeText && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {timeText}
              </span>
            )}
            {typeLabel && (
              <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                {typeLabel}
              </span>
            )}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${STATUS_TONE[activity.status]}`}>
          {activity.status.replace("_", " ")}
        </span>
      </div>
      {(activity.location.location_label || activity.location.place?.title) && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 size-3 shrink-0" />
          <span className="truncate">
            {activity.location.place?.title || activity.location.location_label}
          </span>
        </div>
      )}
      {activity.assignee && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Assigned to <span className="font-medium text-foreground/80">{activity.assignee.display_name}</span>
        </p>
      )}
    </div>
  );
}
