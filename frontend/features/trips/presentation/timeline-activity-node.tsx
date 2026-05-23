"use client";

import {
  ChevronDown,
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
import { cn } from "@/shared/lib/utils";
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

function activityCardSurface(status: TimelineActivity["status"]): string {
  if (status === "IN_PROGRESS")
    return "border-sky-200/80 bg-gradient-to-br from-sky-50/80 via-white to-white";
  if (status === "DONE")
    return "border-emerald-200/60 bg-gradient-to-br from-emerald-50/40 via-white to-white opacity-90";
  if (status === "CANCELLED")
    return "border-rose-200/60 bg-gradient-to-br from-rose-50/40 via-white to-white opacity-70";
  return "border-stone-200/70 bg-white";
}

function statusPillTone(status: TimelineActivity["status"]): string {
  if (status === "IN_PROGRESS")
    return "border-sky-300/60 bg-sky-100/80 text-sky-800 hover:bg-sky-200/70";
  if (status === "DONE")
    return "border-emerald-300/60 bg-emerald-100/80 text-emerald-800 hover:bg-emerald-200/70";
  if (status === "CANCELLED")
    return "border-rose-300/60 bg-rose-100/70 text-rose-800 hover:bg-rose-200/70";
  return "border-stone-300/70 bg-white text-foreground/75 hover:bg-stone-50";
}

const TYPE_COLOR_TEXT: Record<string, string> = {
  sky: "text-sky-700",
  blue: "text-blue-700",
  indigo: "text-indigo-700",
  violet: "text-violet-700",
  fuchsia: "text-fuchsia-700",
  pink: "text-pink-700",
  rose: "text-rose-700",
  red: "text-red-700",
  orange: "text-orange-700",
  amber: "text-amber-700",
  yellow: "text-yellow-700",
  lime: "text-lime-700",
  green: "text-green-700",
  emerald: "text-emerald-700",
  teal: "text-teal-700",
  cyan: "text-cyan-700",
};

function typeColorText(token?: string | null): string {
  if (!token) return "text-foreground/60";
  return TYPE_COLOR_TEXT[token] ?? "text-foreground/60";
}

type Props = {
  activity: TimelineActivity;
  isCurrent?: boolean;
  isHighlighted?: boolean;
  actions?: ReactNode;
  onStatusChange?: (status: TimelineActivityStatus) => void;
};

function DetailLine({
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
    <div className="flex min-w-0 items-start gap-2">
      <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-foreground/45" />
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="mt-0.5 break-words text-sm leading-5 text-foreground/85">
          {value}
        </dd>
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

function activityAssigneeLabel(activity: TimelineActivity): string {
  if (activity.assignee_scope === "EVERYONE") return "Everyone";
  return activity.assignee?.display_name ?? "";
}

function isFixedTimeMode(mode: TimelineActivity["time_mode"]): boolean {
  return mode === "AT_TIME" || mode === "TIME_RANGE";
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
  const typeColor = typeColorText(activity.activity_type?.color_token);
  const buttons = activity.capabilities.can_update_status ? statusButtons(activity) : [];
  const canOpenStatusMenu = Boolean(onStatusChange && buttons.length > 0);
  const statusLabel = formatStatusLabel(activity.status);
  const locationOpenUrl =
    activity.location.location_mode === "STRUCTURED" ? activity.location.open_url : null;
  const locationTitle = activity.location.place?.title || activity.location.location_label;
  const locationAddress = activity.location.place?.address || "";
  const locationNote = activity.location.location_note;
  const locationSubtitle = locationAddress || locationNote;
  const assigneeLabel = activityAssigneeLabel(activity);
  const hasDetails = Boolean(
    activity.note ||
      activity.meeting_point ||
      activity.contact_name ||
      activity.contact_phone ||
      activity.booking_reference ||
      activity.external_link ||
      assigneeLabel,
  );

  const statusControl = canOpenStatusMenu ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="xs"
          variant="outline"
          aria-label="Change status"
          className={cn(
            "shrink-0 border font-semibold uppercase tracking-wide transition-colors",
            statusPillTone(activity.status),
          )}
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
      className={cn(
        "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        statusPillTone(activity.status),
      )}
    >
      {statusLabel}
    </span>
  ) : null;

  return (
    <div
      data-current={isCurrent ? "true" : undefined}
      data-highlighted={isHighlighted ? "true" : undefined}
      data-status={activity.status}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 transition-all duration-300 ease-out",
        activityCardSurface(activity.status),
        isHighlighted
          ? "ring-2 ring-amber-400/60 ring-offset-2 ring-offset-background"
          : isCurrent
            ? "ring-2 ring-sky-400/40"
            : "",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {timeText && (
            <p
              className={cn(
                isFixedTimeMode(activity.time_mode)
                  ? "tabular-nums text-sm font-bold leading-none text-foreground"
                  : "text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-foreground/55",
              )}
            >
              {timeText}
            </p>
          )}
          <p className="mt-1.5 break-words text-base font-semibold leading-snug text-foreground">
            {activity.title}
          </p>
          {typeLabel && (
            <p
              className={cn(
                "mt-1 text-[10px] font-bold uppercase leading-none tracking-[0.16em]",
                typeColor,
              )}
            >
              {typeLabel}
            </p>
          )}
        </div>
        {(statusControl || actions) && (
          <div className="flex shrink-0 items-center gap-1.5">
            {statusControl}
            {actions}
          </div>
        )}
      </div>

      {locationTitle && locationOpenUrl && (
        <a
          className="group/loc mt-3 flex items-center gap-3 rounded-xl bg-foreground/[0.03] px-3 py-2.5 transition-colors hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          href={locationOpenUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open directions to ${locationTitle}`}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-white shadow-sm shadow-sky-500/30">
            <MapPin aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">
              {locationTitle}
            </span>
            {locationSubtitle && (
              <span className="mt-0.5 block truncate text-xs text-foreground/60">
                {locationSubtitle}
              </span>
            )}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-sky-700 transition-transform group-hover/loc:translate-x-0.5">
            Open map
            <Navigation aria-hidden="true" className="size-3.5" />
          </span>
        </a>
      )}

      {locationTitle && !locationOpenUrl && (
        <div className="mt-3 flex items-start gap-2.5">
          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-foreground/55" />
          <div className="min-w-0">
            <p className="break-words text-sm text-foreground/85">{locationTitle}</p>
            {locationSubtitle && (
              <p className="mt-0.5 break-words text-xs leading-5 text-foreground/55">
                {locationSubtitle}
              </p>
            )}
          </div>
        </div>
      )}

      {activity.location.location_note && !locationSubtitle && (
        <p className="mt-2 text-xs text-foreground/55">{activity.location.location_note}</p>
      )}

      {hasDetails && (
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <DetailLine icon={StickyNote} label="Note" value={activity.note} />
          <DetailLine icon={MapPin} label="Meeting point" value={activity.meeting_point} />
          <DetailLine icon={UserRound} label="Contact" value={activity.contact_name} />
          <DetailLine icon={Phone} label="Phone" value={activity.contact_phone} />
          <DetailLine icon={Ticket} label="Booking" value={activity.booking_reference} />
          <DetailLine icon={UserRound} label="Assigned to" value={assigneeLabel} />
          {activity.external_link && (
            <div className="flex min-w-0 items-start gap-2">
              <LinkIcon aria-hidden="true" className="size-3.5" />
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Link
                </dt>
                <dd className="mt-0.5">
                  <a
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
