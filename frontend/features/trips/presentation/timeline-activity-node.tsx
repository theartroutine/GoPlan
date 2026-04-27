"use client";

import { ChevronDown, Clock, ExternalLink, MapPin } from "lucide-react";

import type { TimelineActivity, TimelineActivityStatus } from "@/features/trips/domain/types";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

function formatTimeRange(activity: TimelineActivity): string {
  if (activity.time_mode === "ALL_DAY") return "All day";
  if (activity.time_mode === "FLEXIBLE") return "Flexible";
  const start = activity.start_time?.slice(0, 5) ?? "";
  if (activity.time_mode === "AT_TIME") return start;
  const end = activity.end_time?.slice(0, 5) ?? "";
  return start && end ? `${start} – ${end}` : start || end;
}

const CARD_STATUS_TONE: Record<TimelineActivity["status"], string> = {
  UPCOMING: "border-border/60 bg-card",
  IN_PROGRESS: "border-sky-200 bg-sky-50/70",
  DONE: "border-border/50 bg-card opacity-70",
  CANCELLED: "border-rose-200 bg-rose-50/50 opacity-70",
};

const STATUS_PILL_TONE: Record<TimelineActivity["status"], string> = {
  UPCOMING: "border-border text-muted-foreground",
  IN_PROGRESS: "border-sky-200 bg-sky-100 text-sky-900",
  DONE: "border-emerald-200 bg-emerald-100 text-emerald-900",
  CANCELLED: "border-rose-200 bg-rose-100 text-rose-900",
};

type Props = {
  activity: TimelineActivity;
  isCurrent?: boolean;
  onStatusChange?: (status: TimelineActivityStatus) => void;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-xs text-foreground/85">{value}</dd>
    </div>
  );
}

function statusButtons(activity: TimelineActivity): Array<{ label: string; status: TimelineActivityStatus }> {
  const buttons: Array<{ label: string; status: TimelineActivityStatus }> = [];
  if (activity.status === "UPCOMING") {
    buttons.push({ label: "Start activity", status: "IN_PROGRESS" });
    if (activity.capabilities.can_edit) buttons.push({ label: "Mark done", status: "DONE" });
  } else if (activity.status === "IN_PROGRESS") {
    buttons.push({ label: "Mark done", status: "DONE" });
    buttons.push({ label: "Reset to upcoming", status: "UPCOMING" });
  } else if (activity.status === "DONE") {
    buttons.push({ label: "Reopen activity", status: "IN_PROGRESS" });
    if (activity.capabilities.can_edit) buttons.push({ label: "Reset to upcoming", status: "UPCOMING" });
  } else if (activity.status === "CANCELLED" && activity.capabilities.can_edit) {
    buttons.push({ label: "Restore activity", status: "UPCOMING" });
  }

  if (activity.capabilities.can_edit && activity.status !== "CANCELLED") {
    buttons.push({ label: "Cancel activity", status: "CANCELLED" });
  }
  return buttons;
}

function formatStatusLabel(status: TimelineActivityStatus): string {
  return status.replace("_", " ");
}

export function TimelineActivityNode({ activity, isCurrent = false, onStatusChange }: Props) {
  const timeText = formatTimeRange(activity);
  const typeLabel = activity.activity_type?.label ?? null;
  const buttons = activity.capabilities.can_update_status ? statusButtons(activity) : [];
  const canOpenStatusMenu = Boolean(onStatusChange && buttons.length > 0);
  const statusLabel = formatStatusLabel(activity.status);
  const hasDetails = Boolean(
    activity.note ||
      activity.meeting_point ||
      activity.contact_name ||
      activity.contact_phone ||
      activity.booking_reference ||
      activity.external_link ||
      activity.location.open_url,
  );

  return (
    <div
      data-current={isCurrent ? "true" : undefined}
      data-status={activity.status}
      className={[
        "rounded-lg border p-3 shadow-sm",
        CARD_STATUS_TONE[activity.status],
        isCurrent ? "ring-2 ring-primary/40" : "",
      ].join(" ")}
    >
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
        {canOpenStatusMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="xs"
                variant="outline"
                aria-label="Change status"
                className={`shrink-0 uppercase ${STATUS_PILL_TONE[activity.status]}`}
              >
                {activity.status === "UPCOMING" ? "Status" : statusLabel}
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {buttons.map((button) => (
                <DropdownMenuItem
                  key={`${button.status}-${button.label}`}
                  onSelect={() => onStatusChange?.(button.status)}
                >
                  {button.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : activity.status !== "UPCOMING" ? (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${STATUS_PILL_TONE[activity.status]}`}
          >
            {statusLabel}
          </span>
        ) : null}
      </div>
      {(activity.location.location_label || activity.location.place?.title) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-start gap-1.5">
            <MapPin className="mt-0.5 size-3 shrink-0" />
            <span className="truncate">
              {activity.location.place?.title || activity.location.location_label}
            </span>
          </span>
          {activity.location.open_url && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              aria-label="Open map"
              onClick={() => window.open(activity.location.open_url!, "_blank", "noopener,noreferrer")}
            >
              <MapPin className="size-3" />
            </Button>
          )}
        </div>
      )}
      {activity.location.location_note && (
        <p className="mt-1 text-xs text-muted-foreground">{activity.location.location_note}</p>
      )}
      {hasDetails && (
        <dl className="mt-3 grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-2">
          <DetailRow label="Note" value={activity.note} />
          <DetailRow label="Meeting point" value={activity.meeting_point} />
          <DetailRow label="Contact" value={activity.contact_name} />
          <DetailRow label="Phone" value={activity.contact_phone} />
          <DetailRow label="Booking" value={activity.booking_reference} />
          {activity.external_link && (
            <div>
              <dt className="text-[10px] font-medium uppercase text-muted-foreground">Link</dt>
              <dd className="mt-0.5">
                <a
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                  href={activity.external_link}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open link
                  <ExternalLink className="size-3" />
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}
      {activity.assignee && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Assigned to <span className="font-medium text-foreground/80">{activity.assignee.display_name}</span>
        </p>
      )}
    </div>
  );
}
