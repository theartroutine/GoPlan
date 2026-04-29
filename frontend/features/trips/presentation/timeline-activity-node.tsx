"use client";

import {
  ChevronDown,
  Clock,
  ExternalLink,
  Link as LinkIcon,
  MapPin,
  Navigation,
  Phone,
  StickyNote,
  Ticket,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

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
  isHighlighted?: boolean;
  actions?: ReactNode;
  onStatusChange?: (status: TimelineActivityStatus) => void;
};

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 gap-2">
      <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 break-words text-sm leading-5 text-foreground/85">{value}</dd>
      </div>
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

export function TimelineActivityNode({
  activity,
  isCurrent = false,
  isHighlighted = false,
  actions,
  onStatusChange,
}: Props) {
  const timeText = formatTimeRange(activity);
  const typeLabel = activity.activity_type?.label ?? null;
  const buttons = activity.capabilities.can_update_status ? statusButtons(activity) : [];
  const canOpenStatusMenu = Boolean(onStatusChange && buttons.length > 0);
  const statusLabel = formatStatusLabel(activity.status);
  const locationOpenUrl =
    activity.location.location_mode === "STRUCTURED" ? activity.location.open_url : null;
  const locationTitle = activity.location.place?.title || activity.location.location_label;
  const locationAddress = activity.location.place?.address || "";
  const locationNote = activity.location.location_note;
  const locationSubtitle = locationAddress || locationNote;
  const hasDetails = Boolean(
    activity.note ||
      activity.meeting_point ||
      activity.contact_name ||
      activity.contact_phone ||
      activity.booking_reference ||
      activity.external_link ||
      activity.assignee,
  );
  const statusControl = canOpenStatusMenu ? (
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
          <ChevronDown aria-hidden="true" className="size-3" />
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
  ) : null;

  return (
    <div
      data-current={isCurrent ? "true" : undefined}
      data-highlighted={isHighlighted ? "true" : undefined}
      data-status={activity.status}
      className={[
        "rounded-lg border p-4 shadow-sm transition-[background-color,border-color,box-shadow] duration-300 ease-out",
        CARD_STATUS_TONE[activity.status],
        isHighlighted
          ? "ring-2 ring-primary/70 ring-offset-2 ring-offset-background"
          : isCurrent
            ? "ring-2 ring-primary/40"
            : "",
      ].join(" ")}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <p className="text-base font-semibold leading-6 text-foreground">{activity.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {timeText && (
              <span className="inline-flex min-h-6 items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium text-foreground/80">
                <Clock aria-hidden="true" className="size-3.5" />
                {timeText}
              </span>
            )}
            {typeLabel && (
              <span className="inline-flex min-h-6 items-center rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide">
                {typeLabel}
              </span>
            )}
          </div>
        </div>
        {(statusControl || actions) && (
          <div className="flex shrink-0 items-center justify-end gap-1.5 sm:justify-start">
            {statusControl}
            {actions}
          </div>
        )}
      </div>
      {locationTitle && locationOpenUrl && (
        <a
          className="mt-4 flex w-full flex-col gap-3 border-l-2 border-primary bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:justify-between"
          href={locationOpenUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open directions to ${locationTitle}`}
        >
          <span className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <MapPin aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-primary">
                Directions
              </span>
              <span className="block break-words text-sm font-semibold text-foreground">{locationTitle}</span>
              {locationSubtitle && (
                <span className="mt-0.5 block break-words text-xs leading-5 text-muted-foreground">
                  {locationSubtitle}
                </span>
              )}
              {locationAddress && locationNote && locationNote !== locationAddress && (
                <span className="mt-0.5 block break-words text-xs leading-5 text-muted-foreground">
                  {locationNote}
                </span>
              )}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
            Open map
            <Navigation aria-hidden="true" className="size-3.5" />
          </span>
        </a>
      )}
      {locationTitle && !locationOpenUrl && (
        <div className="mt-4 flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
          <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0">
            <p className="break-words text-foreground/80">{locationTitle}</p>
            {locationSubtitle && (
              <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">
                {locationSubtitle}
              </p>
            )}
          </div>
        </div>
      )}
      {activity.location.location_note && !locationSubtitle && (
        <p className="mt-1 text-xs text-muted-foreground">{activity.location.location_note}</p>
      )}
      {hasDetails && (
        <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-border/60 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailRow icon={StickyNote} label="Note" value={activity.note} />
          <DetailRow icon={MapPin} label="Meeting point" value={activity.meeting_point} />
          <DetailRow icon={UserRound} label="Contact" value={activity.contact_name} />
          <DetailRow icon={Phone} label="Phone" value={activity.contact_phone} />
          <DetailRow icon={Ticket} label="Booking" value={activity.booking_reference} />
          {activity.assignee && (
            <DetailRow icon={UserRound} label="Assigned to" value={activity.assignee.display_name} />
          )}
          {activity.external_link && (
            <div className="flex min-w-0 gap-2">
              <LinkIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Link</dt>
                <dd className="mt-0.5">
                  <a
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    href={activity.external_link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open link
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                  </a>
                </dd>
              </div>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
