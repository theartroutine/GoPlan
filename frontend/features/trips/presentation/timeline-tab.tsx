"use client";

import axios from "axios";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type {
  CreateActivityPayload,
  PatchActivityPayload,
  TimelineActivity,
  TimelineResponse,
  TimelineSection,
} from "@/features/trips/domain/types";
import {
  bffCreateTimelineActivity,
  bffCreateTimelineSection,
  bffDeleteTimelineActivity,
  bffDeleteTimelineSection,
  bffGetTimeline,
  bffPatchTimelineActivity,
  bffPatchTimelineSection,
  bffUpdateTimelineActivityStatus,
} from "@/features/trips/infrastructure/trips-api";
import { TimelineActivityModal } from "@/features/trips/presentation/timeline-activity-modal";
import { TimelineActivityNode } from "@/features/trips/presentation/timeline-activity-node";
import { TimelineCustomTypesModal } from "@/features/trips/presentation/timeline-custom-types-modal";
import {
  isTimelineActivityFocusEvent,
  TIMELINE_ACTIVITY_FOCUS_EVENT,
} from "@/features/trips/presentation/timeline-focus-events";
import { TimelineSectionModal } from "@/features/trips/presentation/timeline-section-modal";
import {
  findNowDividerIndex,
  formatSectionDate,
  getActiveActivityIds,
  getNowMarkerPlacement,
  getOverviewHint,
  groupActivitiesForDay,
  type SectionDatePosition,
} from "@/features/trips/presentation/timeline-view-model";
import {
  buildDayHref,
  buildOverviewHref,
  resolveTimelineUrlState,
} from "@/features/trips/presentation/timeline-url-state";
import { useTripContext } from "@/features/trips/presentation/trip-context";
import { cn } from "@/shared/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

type ActivityModalState =
  | { kind: "closed" }
  | { kind: "create"; sectionId: string }
  | { kind: "edit"; activity: TimelineActivity };

type SectionModalState =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; section: TimelineSection };

type DeleteDialogState =
  | { kind: "closed" }
  | { kind: "activity"; activity: TimelineActivity }
  | { kind: "section"; section: TimelineSection };

type NowMarkerPlacement = ReturnType<typeof getNowMarkerPlacement>;
const EMPTY_ACTIVE_IDS: ReadonlySet<string> = new Set();

function TimelineSkeleton() {
  return (
    <div data-testid="timeline-skeleton" className="space-y-6">
      {Array.from({ length: 3 }).map((_, sectionIdx) => (
        <div key={sectionIdx} className="space-y-3">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, activityIdx) => (
              <div key={activityIdx} className="h-16 animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineEmptyState({ canEdit }: { canEdit: boolean }) {
  if (canEdit) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
        <h3 className="text-sm font-semibold">Start building your timeline</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Add the first day to turn this trip into an actionable plan.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <h3 className="text-sm font-semibold">Timeline is not ready yet</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        The captain has not added any timeline days yet.
      </p>
    </div>
  );
}

function extractError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { detail?: string } } })?.response?.data;
  return data?.detail ?? fallback;
}

function localDate(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year") ?? "0000"}-${values.get("month") ?? "01"}-${values.get("day") ?? "01"}`;
}

function sectionPositionLabel(sectionDate: string, timeZone: string): SectionDatePosition {
  const today = localDate(timeZone);
  if (sectionDate === today) return "Today";
  return sectionDate < today ? "Past" : "Upcoming";
}

function datePositionTone(position: SectionDatePosition): string {
  if (position === "Today") {
    return "bg-primary text-primary-foreground";
  }
  if (position === "Upcoming") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300";
  }
  return "bg-muted text-muted-foreground";
}

function SectionDateBadge({
  sectionDate,
  datePosition,
}: {
  sectionDate: string;
  datePosition: SectionDatePosition;
}) {
  return (
    <span className="inline-flex min-w-fit flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <CalendarDays aria-hidden="true" className="size-3.5" />
        <span className="tabular-nums font-medium text-foreground">{sectionDate}</span>
      </span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-none",
          datePositionTone(datePosition),
        )}
      >
        {datePosition}
      </span>
    </span>
  );
}

function canDeleteDay(section: TimelineSection): boolean {
  return !section.is_in_trip_range && section.activities.length === 0;
}

function timelineActivityElementId(activityId: string): string {
  return `timeline-activity-${activityId}`;
}

function getTimelineFocusScrollBehavior(): ScrollBehavior {
  if (typeof window.matchMedia !== "function") return "smooth";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function scrollTimelineActivityIntoView(activityId: string): boolean {
  const element = document.getElementById(timelineActivityElementId(activityId));
  if (typeof element?.scrollIntoView !== "function") return false;

  window.requestAnimationFrame(() => {
    element.scrollIntoView({
      behavior: getTimelineFocusScrollBehavior(),
      block: "center",
    });
  });
  return true;
}

function isNowMarkerBefore(activity: TimelineActivity, placement: NowMarkerPlacement): boolean {
  return (
    (placement.kind === "before" && placement.activityId === activity.id) ||
    (placement.kind === "inside" && placement.activityId === activity.id)
  );
}

function isNowMarkerAfter(activity: TimelineActivity, placement: NowMarkerPlacement): boolean {
  return (
    (placement.kind === "between" && placement.previousActivityId === activity.id) ||
    (placement.kind === "after" && placement.activityId === activity.id)
  );
}

function NowMarkerItem({ displayTime }: { displayTime: string }) {
  return (
    <li className="flex items-center gap-2 py-1 text-xs font-semibold text-primary">
      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
      <span className="h-0.5 min-w-6 flex-1 bg-primary/50" />
      <span className="whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5">
        Now · {displayTime}
      </span>
      <span className="h-0.5 min-w-6 flex-1 bg-primary/50" />
    </li>
  );
}

function useNow(timeZone: string): { instant: Date; displayTime: string; date: string; minutes: number } {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);

    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get("year") ?? "0000";
    const month = values.get("month") ?? "01";
    const day = values.get("day") ?? "01";
    const hour = Number(values.get("hour") ?? "0");
    const minute = Number(values.get("minute") ?? "0");

    return {
      instant: now,
      displayTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      date: `${year}-${month}-${day}`,
      minutes: hour * 60 + minute,
    };
  }, [now, timeZone]);
}

function NowDivider({
  label,
  displayTime,
  href,
}: {
  label: string;
  displayTime: string;
  href: string;
}) {
  return (
    <div
      className="relative my-1 flex items-center pl-7"
      role="separator"
      aria-label={`Current time: ${label} ${displayTime}`}
    >
      <span className="absolute left-0 size-4 animate-pulse rounded-full bg-primary ring-2 ring-primary/20" />
      <span className="h-0.5 flex-1 bg-primary/70" />
      <Link
        href={href}
        className="mx-2 shrink-0 whitespace-nowrap rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Now · {label} · {displayTime}
      </Link>
      <span className="h-0.5 flex-1 bg-primary/70" />
    </div>
  );
}

function IconButton({
  label,
  children,
  onClick,
  variant = "outline",
  className,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  variant?: "outline" | "destructive" | "ghost";
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant={variant}
          aria-label={label}
          onClick={onClick}
          className={className}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TimelineTab() {
  const { tripId, data: tripData } = useTripContext();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();

  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [activityModal, setActivityModal] = useState<ActivityModalState>({ kind: "closed" });
  const [sectionModal, setSectionModal] = useState<SectionModalState>({ kind: "closed" });
  const [customTypesOpen, setCustomTypesOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({ kind: "closed" });

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await bffGetTimeline(tripId, signal);
      setData(result);
    } catch (err: unknown) {
      if (signal?.aborted || axios.isCancel(err)) return;
      setError("Failed to load timeline.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refetch = useCallback(() => load(), [load]);
  const members = useMemo(() => tripData?.members ?? [], [tripData]);
  const sectionIds = useMemo(
    () => new Set(data?.sections.map((section) => section.id) ?? []),
    [data?.sections],
  );
  const activitySectionIds = useMemo(() => {
    const ids = new Map<string, string>();
    for (const section of data?.sections ?? []) {
      for (const activity of section.activities) {
        ids.set(activity.id, section.id);
      }
    }
    return ids;
  }, [data?.sections]);
  const timelineUrlState = useMemo(
    () => resolveTimelineUrlState({
      pathname,
      search: searchParamString,
      sectionIds,
      activitySectionIds,
    }),
    [pathname, searchParamString, sectionIds, activitySectionIds],
  );
  const targetActivityId = timelineUrlState.targetActivityId ?? null;

  useEffect(() => {
    if (!data || timelineUrlState.replacementHref === null) {
      return;
    }
    router.replace(timelineUrlState.replacementHref, { scroll: false });
  }, [data, router, timelineUrlState.replacementHref]);

  useEffect(() => {
    if (!data || !targetActivityId) {
      return;
    }

    scrollTimelineActivityIntoView(targetActivityId);
  }, [data, targetActivityId, timelineUrlState.dayId]);

  useEffect(() => {
    function handleTimelineActivityFocus(event: Event) {
      if (!isTimelineActivityFocusEvent(event) || event.detail.tripId !== tripId) {
        return;
      }
      scrollTimelineActivityIntoView(event.detail.activityId);
    }

    window.addEventListener(TIMELINE_ACTIVITY_FOCUS_EVENT, handleTimelineActivityFocus);
    return () => {
      window.removeEventListener(TIMELINE_ACTIVITY_FOCUS_EVENT, handleTimelineActivityFocus);
    };
  }, [tripId]);

  const now = useNow(data?.trip_timezone ?? "UTC");
  const nowDividerIndex = useMemo(
    () => (data ? findNowDividerIndex(data.sections, now.date) : null),
    [data, now.date],
  );

  if (loading && !data) return <TimelineSkeleton />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;

  const timelineData = data;
  const canEdit = timelineData.permissions.can_edit_timeline;
  const canCreateSections = canEdit && timelineData.permissions.can_create_sections;
  const canManageCustomTypes = canEdit && timelineData.permissions.can_manage_custom_types;
  const unavailableSectionDates = timelineData.sections.map((section) => section.section_date);
  const selectedSection = timelineUrlState.dayId
    ? timelineData.sections.find((section) => section.id === timelineUrlState.dayId) ?? null
    : null;

  function sectionDateExists(sectionDate: string, excludeSectionId?: string): boolean {
    return timelineData.sections.some(
      (section) => section.section_date === sectionDate && section.id !== excludeSectionId,
    );
  }

  function openActivityModal(next: ActivityModalState) {
    setActionError(null);
    setActivityModal(next);
  }

  function openSectionModal(next: SectionModalState) {
    setActionError(null);
    setSectionModal(next);
  }

  function closeActivityModal() {
    setActionError(null);
    setActivityModal({ kind: "closed" });
  }

  function closeSectionModal() {
    setActionError(null);
    setSectionModal({ kind: "closed" });
  }

  async function handleCreateSection(payload: { label: string; section_date?: string }) {
    if (!payload.section_date) return;
    if (sectionDateExists(payload.section_date)) {
      setActionError("This date already has a timeline day.");
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      await bffCreateTimelineSection(tripId, {
        section_date: payload.section_date,
        label: payload.label,
      });
      closeSectionModal();
      toast.success("Day added");
      await refetch();
    } catch (err) {
      setActionError(extractError(err, "Failed to create day."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePatchSection(section: TimelineSection, payload: { label: string; section_date?: string }) {
    if (payload.section_date && sectionDateExists(payload.section_date, section.id)) {
      setActionError("This date already has a timeline day.");
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      await bffPatchTimelineSection(tripId, section.id, payload);
      closeSectionModal();
      toast.success("Day updated");
      await refetch();
    } catch (err) {
      setActionError(extractError(err, "Failed to update day."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateActivity(sectionId: string, payload: CreateActivityPayload) {
    setSubmitting(true);
    setActionError(null);
    try {
      await bffCreateTimelineActivity(tripId, sectionId, payload);
      closeActivityModal();
      toast.success("Activity added");
      await refetch();
    } catch (err) {
      setActionError(extractError(err, "Failed to create activity."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePatchActivity(activity: TimelineActivity, payload: PatchActivityPayload) {
    setSubmitting(true);
    setActionError(null);
    try {
      await bffPatchTimelineActivity(tripId, activity.id, payload);
      closeActivityModal();
      toast.success("Activity updated");
      await refetch();
    } catch (err) {
      setActionError(extractError(err, "Failed to update activity."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (deleteDialog.kind === "closed") return;

    setDeleting(true);
    setActionError(null);
    try {
      if (deleteDialog.kind === "activity") {
        await bffDeleteTimelineActivity(tripId, deleteDialog.activity.id);
        toast.success("Activity deleted");
      } else {
        await bffDeleteTimelineSection(tripId, deleteDialog.section.id);
        toast.success("Day deleted");
      }
      setDeleteDialog({ kind: "closed" });
      await refetch();
    } catch (err) {
      setDeleteDialog({ kind: "closed" });
      setActionError(
        extractError(
          err,
          deleteDialog.kind === "activity"
            ? "Failed to delete activity."
            : "Failed to delete day.",
        ),
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleUpdateActivityStatus(activity: TimelineActivity, status: TimelineActivity["status"]) {
    setActionError(null);
    try {
      await bffUpdateTimelineActivityStatus(tripId, activity.id, { status });
      toast.success("Activity status updated");
      await refetch();
    } catch (err) {
      setActionError(extractError(err, "Failed to update activity status."));
    }
  }

  function handleCustomTypesChanged() {
    void refetch();
  }

  function renderActivityActions(activity: TimelineActivity) {
    if (!canEdit || (!activity.capabilities.can_edit && !activity.capabilities.can_delete)) {
      return null;
    }

    return (
      <div
        className="inline-flex items-center gap-0.5 rounded-md border border-border/70 bg-background/80 p-0.5 shadow-xs"
        role="group"
        aria-label={`Actions for ${activity.title}`}
      >
        {activity.capabilities.can_edit && (
          <IconButton
            label={`Edit ${activity.title}`}
            variant="ghost"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={() => openActivityModal({ kind: "edit", activity })}
          >
            <Pencil className="size-3.5" />
          </IconButton>
        )}
        {activity.capabilities.can_delete && (
          <IconButton
            label={`Delete ${activity.title}`}
            variant="ghost"
            className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/20"
            onClick={() => setDeleteDialog({ kind: "activity", activity })}
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        )}
      </div>
    );
  }

  function renderActivityGroup(
    label: string,
    activities: TimelineActivity[],
    nowMarkerPlacement: NowMarkerPlacement = { kind: "none" },
    activeIds: ReadonlySet<string> = EMPTY_ACTIVE_IDS,
    displayTime = "",
  ) {
    if (activities.length === 0) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">{label}</h4>
          <span className="text-[11px] text-muted-foreground">{activities.length}</span>
        </div>
        <ol className="space-y-2">
          {activities.map((activity) => (
            <Fragment key={activity.id}>
              {isNowMarkerBefore(activity, nowMarkerPlacement) ? (
                <NowMarkerItem displayTime={displayTime} />
              ) : null}
              <li id={timelineActivityElementId(activity.id)} className="scroll-mt-24">
                <TimelineActivityNode
                  activity={activity}
                  actions={renderActivityActions(activity)}
                  isCurrent={activeIds.has(activity.id)}
                  isHighlighted={targetActivityId === activity.id}
                  onStatusChange={(nextStatus) => void handleUpdateActivityStatus(activity, nextStatus)}
                />
              </li>
              {isNowMarkerAfter(activity, nowMarkerPlacement) ? (
                <NowMarkerItem displayTime={displayTime} />
              ) : null}
            </Fragment>
          ))}
        </ol>
      </div>
    );
  }

  function renderSectionManagementActions(section: TimelineSection) {
    if (!canEdit) return null;

    return (
      <>
        <IconButton
          label={`Edit ${section.label}`}
          onClick={() => openSectionModal({ kind: "edit", section })}
        >
          <Pencil className="size-3" />
        </IconButton>
        {canDeleteDay(section) && (
          <IconButton
            label={`Delete ${section.label}`}
            variant="destructive"
            onClick={() => setDeleteDialog({ kind: "section", section })}
          >
            <Trash2 className="size-3" />
          </IconButton>
        )}
      </>
    );
  }

  function timelineDotClass(datePosition: SectionDatePosition): string {
    if (datePosition === "Today") return "border-primary bg-primary ring-2 ring-primary/20";
    if (datePosition === "Upcoming") return "border-emerald-500 bg-background dark:border-emerald-400";
    return "border-border bg-muted/40";
  }

  function renderOverviewSectionActions(section: TimelineSection) {
    if (!canEdit) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Day options"
            className="size-7 shrink-0 text-muted-foreground"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => openSectionModal({ kind: "edit", section })}>
            <Pencil className="size-3.5" />
            Edit day
          </DropdownMenuItem>
          {canDeleteDay(section) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setDeleteDialog({ kind: "section", section })}
              >
                <Trash2 className="size-3.5" />
                Delete day
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function renderOverview() {
    return (
      <div className="space-y-4">
        {timelineData.sections.map((section, index) => {
          const datePosition = sectionPositionLabel(section.section_date, timelineData.trip_timezone);
          const formattedDate = formatSectionDate(section.section_date);
          const groups = groupActivitiesForDay(section.activities);
          const hint = getOverviewHint(groups, datePosition);
          const inProgressCount = section.activities.filter((a) => a.status === "IN_PROGRESS").length;
          const isEmpty = section.activities.length === 0;

          return (
            <Fragment key={section.id}>
              <section
                className={cn("relative pl-7", isEmpty && "opacity-60")}
              >
                <div className="absolute bottom-[-1rem] left-[7px] top-5 w-px bg-border" />
                <span
                  className={cn(
                    "absolute left-0 top-1 size-4 rounded-full border-2",
                    timelineDotClass(datePosition),
                  )}
                />

                <div
                  className={cn(
                    "overflow-hidden rounded-lg border shadow-sm",
                    datePosition === "Today" ? "border-primary/30" : "border-border/70",
                  )}
                >
                  <div
                    className={cn(
                      "border-l-[3px]",
                      datePosition === "Today"
                        ? "border-l-primary"
                        : datePosition === "Upcoming"
                          ? "border-l-emerald-500 dark:border-l-emerald-400"
                          : "border-l-border",
                    )}
                  >
                    {/* Card body */}
                    <div
                      className={cn(
                        "px-3 pb-2.5 pt-3",
                        datePosition === "Today" && "bg-primary/[0.02]",
                      )}
                    >
                      {/* Row 1: title + actions */}
                      <div className="mb-1.5 flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold leading-snug text-foreground">
                          {section.label}
                        </h3>
                        {renderOverviewSectionActions(section)}
                      </div>

                      {/* Row 2: date + status pill */}
                      <div className="mb-2.5 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formattedDate}</span>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                            datePositionTone(datePosition),
                          )}
                        >
                          {datePosition}
                        </span>
                      </div>

                      {/* Row 3: activity chips */}
                      <div className="flex flex-wrap gap-1.5">
                        {inProgressCount > 0 && (
                          <span className="inline-flex min-h-5 items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 text-[11px] font-medium text-primary">
                            {inProgressCount} in progress
                          </span>
                        )}
                        {groups.timeline.length > 0 && (
                          <span className="inline-flex min-h-5 items-center rounded-full border border-border bg-muted px-2.5 text-[11px] font-medium text-foreground/80">
                            {groups.timeline.length} scheduled
                          </span>
                        )}
                        {groups.allDay.length > 0 && (
                          <span className="inline-flex min-h-5 items-center rounded-full border border-border bg-muted px-2.5 text-[11px] font-medium text-foreground/80">
                            {groups.allDay.length} all-day
                          </span>
                        )}
                        {groups.flexible.length > 0 && (
                          <span className="inline-flex min-h-5 items-center rounded-full border border-border bg-muted px-2.5 text-[11px] font-medium text-foreground/80">
                            {groups.flexible.length} flexible
                          </span>
                        )}
                        {isEmpty && (
                          <span className="inline-flex min-h-5 items-center rounded-full border border-dashed border-border px-2.5 text-[11px] text-muted-foreground">
                            No activities yet
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Footer: hint + open day */}
                    <div
                      className={cn(
                        "flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2",
                        datePosition === "Today" ? "bg-primary/[0.03]" : "bg-muted/30",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {hint
                          ? `${hint.prefix}: ${hint.time ? `${hint.time} – ` : ""}${hint.title}`
                          : ""}
                      </span>
                      <Button asChild size="xs" variant="outline" className="shrink-0">
                        <Link href={buildDayHref(pathname, searchParamString, section.id)}>
                          Open day
                          <ArrowRight className="size-3" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              {index === nowDividerIndex && (
                <NowDivider
                  label={section.label}
                  displayTime={now.displayTime}
                  href={buildDayHref(pathname, searchParamString, section.id)}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    );
  }

  function renderDayDetail(section: TimelineSection) {
    const groups = groupActivitiesForDay(section.activities);
    const isToday = section.section_date === now.date;
    const nowMarkerPlacement: NowMarkerPlacement = isToday
      ? getNowMarkerPlacement(groups.timeline, timelineData.trip_timezone, now.instant)
      : { kind: "none" };
    const activeIds = isToday
      ? getActiveActivityIds(groups.timeline, now.minutes)
      : new Set<string>();

    const sectionIndex = timelineData.sections.findIndex((item) => item.id === section.id);
    const previousSection = sectionIndex > 0 ? timelineData.sections[sectionIndex - 1] : null;
    const nextSection =
      sectionIndex >= 0 && sectionIndex < timelineData.sections.length - 1
        ? timelineData.sections[sectionIndex + 1]
        : null;
    const datePosition = sectionPositionLabel(section.section_date, timelineData.trip_timezone);
    const headingId = `timeline-day-detail-${section.id}`;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button asChild size="sm">
            <Link href={buildOverviewHref(pathname, searchParamString)}>
              <ArrowLeft className="size-4" />
              Back to timeline
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {previousSection && (
              <Button asChild size="sm" variant="outline">
                <Link href={buildDayHref(pathname, searchParamString, previousSection.id)}>
                  Previous day
                </Link>
              </Button>
            )}
            {nextSection && (
              <Button asChild size="sm" variant="outline">
                <Link href={buildDayHref(pathname, searchParamString, nextSection.id)}>
                  Next day
                </Link>
              </Button>
            )}
          </div>
        </div>

        <section
          aria-labelledby={headingId}
          className={cn(
            "overflow-hidden rounded-lg border bg-background shadow-xs",
            datePosition === "Today" ? "border-primary/35" : "border-border/70",
          )}
        >
          <header
            className={cn(
              "border-b px-4 py-4",
              datePosition === "Today"
                ? "border-primary/15 bg-primary/[0.035]"
                : "border-border/70 bg-muted/20",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Day Detail
                  </p>
                  <span aria-hidden="true" className="size-1 rounded-full bg-muted-foreground/40" />
                  <SectionDateBadge
                    sectionDate={section.section_date}
                    datePosition={datePosition}
                  />
                </div>
                <div className="min-w-0">
                  <h3 id={headingId} className="truncate text-xl font-semibold leading-tight text-foreground">
                    {section.label}
                  </h3>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {renderSectionManagementActions(section)}
                {canEdit && (
                  <Button
                    type="button"
                    size="xs"
                    onClick={() => openActivityModal({ kind: "create", sectionId: section.id })}
                  >
                    <Plus aria-hidden="true" className="size-3" />
                    Add activity
                  </Button>
                )}
              </div>
            </div>
          </header>

          <div
            className={cn(
              "px-3 py-4 sm:px-4",
              datePosition === "Today" ? "bg-primary/[0.015]" : "bg-muted/10",
            )}
          >
            {section.activities.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/70 bg-background/70 px-3 py-5 text-center text-xs text-muted-foreground">
                No activities yet.
              </p>
            ) : (
              <div className="space-y-4">
                {renderActivityGroup("All-day", groups.allDay)}
                {renderActivityGroup("Timeline", groups.timeline, nowMarkerPlacement, activeIds, now.displayTime)}
                {renderActivityGroup("Flexible", groups.flexible)}
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  const deleteTitle =
    deleteDialog.kind === "activity"
      ? "Delete activity?"
      : "Delete day?";
  const deleteDescription =
    deleteDialog.kind === "activity"
      ? `This will permanently delete "${deleteDialog.activity.title}".`
      : deleteDialog.kind === "section"
        ? `This will permanently delete "${deleteDialog.section.label}".`
        : "";

  return (
    <TooltipProvider delayDuration={0}>
      <div className="space-y-4">
        {!selectedSection && (canCreateSections || canManageCustomTypes) && (
          <div className="flex flex-wrap items-center gap-2">
            {canCreateSections && (
              <Button type="button" size="sm" onClick={() => openSectionModal({ kind: "create" })}>
                <Plus className="size-4" />
                Add day
              </Button>
            )}
            {canManageCustomTypes && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setCustomTypesOpen(true)}
              >
                <Settings className="size-4" />
                Manage types
              </Button>
            )}
          </div>
        )}

        {actionError && <p className="text-sm text-destructive">{actionError}</p>}

        {timelineData.sections.length === 0 ? (
          <TimelineEmptyState canEdit={canEdit} />
        ) : selectedSection ? (
          renderDayDetail(selectedSection)
        ) : (
          renderOverview()
        )}

        <TimelineActivityModal
          open={activityModal.kind !== "closed"}
          mode={activityModal.kind === "edit" ? "edit" : "create"}
          initial={activityModal.kind === "edit" ? activityModal.activity : undefined}
          members={members}
          systemTypes={timelineData.system_types}
          customTypes={timelineData.custom_types}
          submitting={submitting}
          errorMessage={actionError}
          onOpenChange={(open) => {
            if (!open) closeActivityModal();
          }}
          onSubmit={(payload) => {
            if (activityModal.kind === "create") {
              void handleCreateActivity(activityModal.sectionId, payload as CreateActivityPayload);
            } else if (activityModal.kind === "edit") {
              void handlePatchActivity(activityModal.activity, payload as PatchActivityPayload);
            }
          }}
        />

        <TimelineSectionModal
          open={sectionModal.kind !== "closed"}
          mode={sectionModal.kind === "edit" ? "edit" : "create"}
          initial={sectionModal.kind === "edit" ? sectionModal.section : undefined}
          submitting={submitting}
          errorMessage={actionError}
          unavailableSectionDates={unavailableSectionDates}
          onOpenChange={(open) => {
            if (!open) closeSectionModal();
          }}
          onSubmit={(payload) => {
            if (sectionModal.kind === "create") {
              void handleCreateSection(payload);
            } else if (sectionModal.kind === "edit") {
              void handlePatchSection(sectionModal.section, payload);
            }
          }}
        />

        <TimelineCustomTypesModal
          open={customTypesOpen}
          tripId={tripId}
          customTypes={timelineData.custom_types}
          onOpenChange={setCustomTypesOpen}
          onChanged={handleCustomTypesChanged}
        />

        <AlertDialog
          open={deleteDialog.kind !== "closed"}
          onOpenChange={(open) => {
            if (!open && !deleting) {
              setDeleteDialog({ kind: "closed" });
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
              <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={deleting}
                onClick={(event) => {
                  event.preventDefault();
                  void handleConfirmDelete();
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
