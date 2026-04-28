"use client";

import axios from "axios";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
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
import { TimelineSectionModal } from "@/features/trips/presentation/timeline-section-modal";
import {
  getDefaultFocusedSectionId,
  getNowMarkerPlacement,
  groupActivitiesForDay,
  limitActivityGroup,
} from "@/features/trips/presentation/timeline-view-model";
import { useTripContext } from "@/features/trips/presentation/trip-context";
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

type ActivityGroups = ReturnType<typeof groupActivitiesForDay>;
type NowMarkerPlacement = ReturnType<typeof getNowMarkerPlacement>;

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
          Add Day 0 or your first activity to turn this trip into an actionable plan.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <h3 className="text-sm font-semibold">Timeline is not ready yet</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        The captain has not added any activities yet.
      </p>
    </div>
  );
}

function extractError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { detail?: string } } })?.response?.data;
  return data?.detail ?? fallback;
}

function formatActivityTime(activity: TimelineActivity): string {
  if (activity.time_mode === "ALL_DAY") return "All day";
  if (activity.time_mode === "FLEXIBLE") return "Flexible";

  const start = activity.start_time?.slice(0, 5) ?? "";
  if (activity.time_mode === "AT_TIME") return start;

  const end = activity.end_time?.slice(0, 5) ?? "";
  return start && end ? `${start} - ${end}` : start || end;
}

function summarizeGroups(groups: ActivityGroups): string {
  const parts = [
    groups.allDay.length > 0 ? `${groups.allDay.length} all-day` : null,
    groups.timeline.length > 0 ? `${groups.timeline.length} scheduled` : null,
    groups.flexible.length > 0 ? `${groups.flexible.length} flexible` : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(" / ") : "No activities";
}

function getNextScheduledActivity(groups: ActivityGroups): TimelineActivity | null {
  return groups.timeline.find((activity) => Boolean(activity.start_time)) ?? null;
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

function sectionPositionLabel(sectionDate: string, timeZone: string): string {
  const today = localDate(timeZone);
  if (sectionDate === today) return "Today";
  return sectionDate < today ? "Past" : "Upcoming";
}

function canDeleteDay(section: TimelineSection): boolean {
  return !section.is_in_trip_range && section.activities.length === 0;
}

function parseOpenSectionIds(value: string | null, sectionIds: Set<string>): Set<string> {
  if (!value) return new Set();

  return new Set(
    value
      .split(",")
      .map((id) => id.trim())
      .filter((id) => sectionIds.has(id)),
  );
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

function isCurrentActivity(activity: TimelineActivity, placement: NowMarkerPlacement): boolean {
  return placement.kind === "inside" && placement.activityId === activity.id;
}

function NowMarkerItem({ markerKey }: { markerKey: string }) {
  return (
    <li key={markerKey} className="flex items-center gap-2 py-1 text-xs font-medium text-primary">
      <span className="h-px min-w-6 flex-1 bg-primary/40" />
      <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5">
        Now
      </span>
      <span className="h-px min-w-6 flex-1 bg-primary/40" />
    </li>
  );
}

function IconButton({
  label,
  children,
  onClick,
  variant = "outline",
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  variant?: "outline" | "destructive";
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [openSectionIds, setOpenSectionIds] = useState<Set<string>>(new Set());
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
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
  const querySectionId = searchParams.get("section");
  const queryOpenSections = searchParams.get("openSections");
  const resolvedFocusedSectionId = useMemo(() => {
    if (!data) return null;
    if (querySectionId && sectionIds.has(querySectionId)) return querySectionId;
    return getDefaultFocusedSectionId(data.sections, data.trip_timezone);
  }, [data, querySectionId, sectionIds]);
  const queryOpenSectionIds = useMemo(
    () => parseOpenSectionIds(queryOpenSections, sectionIds),
    [queryOpenSections, sectionIds],
  );
  const effectiveFocusedSectionId =
    focusedSectionId && sectionIds.has(focusedSectionId)
      ? focusedSectionId
      : resolvedFocusedSectionId;
  const visibleOpenSectionIds = useMemo(() => {
    const next = new Set(openSectionIds);
    if (effectiveFocusedSectionId) next.add(effectiveFocusedSectionId);
    return next;
  }, [effectiveFocusedSectionId, openSectionIds]);

  useEffect(() => {
    if (!data) return;
    setFocusedSectionId(resolvedFocusedSectionId);
    setOpenSectionIds(queryOpenSectionIds);
  }, [data, queryOpenSectionIds, resolvedFocusedSectionId, searchParamString]);

  useEffect(() => {
    if (!effectiveFocusedSectionId) return;
    setOpenSectionIds((current) => {
      if (current.has(effectiveFocusedSectionId)) return current;
      const next = new Set(current);
      next.add(effectiveFocusedSectionId);
      return next;
    });
  }, [effectiveFocusedSectionId]);

  if (loading && !data) return <TimelineSkeleton />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;

  const timelineData = data;
  const canEdit = timelineData.permissions.can_edit_timeline;
  const canCreateSections = canEdit && timelineData.permissions.can_create_sections;
  const canManageCustomTypes = canEdit && timelineData.permissions.can_manage_custom_types;
  const hasAnyActivity = timelineData.sections.some((section) => section.activities.length > 0);

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

  function serializeOpenSectionIds(openIds: Set<string>): string {
    return timelineData.sections
      .map((section) => section.id)
      .filter((sectionId) => openIds.has(sectionId))
      .join(",");
  }

  function replaceFocusedSectionUrl(sectionId: string, openIds: Set<string>) {
    const params = new URLSearchParams(searchParamString);
    const nextOpenIds = new Set(
      Array.from(openIds).filter((openSectionId) => sectionIds.has(openSectionId)),
    );
    nextOpenIds.add(sectionId);
    params.set("section", sectionId);

    if (nextOpenIds.size > 1) {
      params.set("openSections", serializeOpenSectionIds(nextOpenIds));
    } else {
      params.delete("openSections");
    }

    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  function focusSection(sectionId: string) {
    const nextOpenSectionIds = new Set(openSectionIds);
    if (effectiveFocusedSectionId) {
      nextOpenSectionIds.add(effectiveFocusedSectionId);
    }
    nextOpenSectionIds.add(sectionId);
    setFocusedSectionId(sectionId);
    setOpenSectionIds(nextOpenSectionIds);
    replaceFocusedSectionUrl(sectionId, nextOpenSectionIds);
  }

  function toggleSection(sectionId: string, isOpen: boolean, isFocused: boolean) {
    if (!isOpen) {
      focusSection(sectionId);
      return;
    }
    if (isFocused) return;

    const nextOpenSectionIds = new Set(openSectionIds);
    nextOpenSectionIds.delete(sectionId);
    setOpenSectionIds(nextOpenSectionIds);
    if (effectiveFocusedSectionId) {
      replaceFocusedSectionUrl(effectiveFocusedSectionId, nextOpenSectionIds);
    }
  }

  function expandGroup(groupKey: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      next.add(groupKey);
      return next;
    });
  }

  async function handleCreateSection(payload: { label: string; section_date?: string }) {
    if (!payload.section_date) return;
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
      <div className="flex shrink-0 flex-row gap-1 sm:flex-col">
        {activity.capabilities.can_edit && (
          <IconButton
            label={`Edit ${activity.title}`}
            onClick={() => openActivityModal({ kind: "edit", activity })}
          >
            <Pencil className="size-3" />
          </IconButton>
        )}
        {activity.capabilities.can_delete && (
          <IconButton
            label={`Delete ${activity.title}`}
            variant="destructive"
            onClick={() => setDeleteDialog({ kind: "activity", activity })}
          >
            <Trash2 className="size-3" />
          </IconButton>
        )}
      </div>
    );
  }

  function renderActivityGroup(
    label: string,
    activities: TimelineActivity[],
    groupKey: string,
    nowMarkerPlacement: NowMarkerPlacement = { kind: "none" },
  ) {
    if (activities.length === 0) return null;

    const { visible, hiddenCount } = limitActivityGroup(
      activities,
      expandedGroups.has(groupKey),
      5,
    );

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">{label}</h4>
          <span className="text-[11px] text-muted-foreground">{activities.length}</span>
        </div>
        <ol className="space-y-2">
          {visible.map((activity) => (
            <Fragment key={activity.id}>
              {isNowMarkerBefore(activity, nowMarkerPlacement) ? (
                <NowMarkerItem markerKey={`${activity.id}:now-before`} />
              ) : null}
              <li className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <TimelineActivityNode
                    activity={activity}
                    isCurrent={isCurrentActivity(activity, nowMarkerPlacement)}
                    onStatusChange={(nextStatus) => void handleUpdateActivityStatus(activity, nextStatus)}
                  />
                </div>
                {renderActivityActions(activity)}
              </li>
              {isNowMarkerAfter(activity, nowMarkerPlacement) ? (
                <NowMarkerItem markerKey={`${activity.id}:now-after`} />
              ) : null}
            </Fragment>
          ))}
        </ol>
        {hiddenCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => expandGroup(groupKey)}
          >
            Show {hiddenCount} more
          </Button>
        )}
      </div>
    );
  }

  function renderSectionContent(section: TimelineSection) {
    const groups = groupActivitiesForDay(section.activities);
    const nowMarkerPlacement =
      effectiveFocusedSectionId === section.id &&
      section.section_date === localDate(timelineData.trip_timezone)
        ? getNowMarkerPlacement(groups.timeline, timelineData.trip_timezone)
        : ({ kind: "none" } satisfies NowMarkerPlacement);

    if (section.activities.length === 0) {
      return (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
          No activities yet.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        {renderActivityGroup("All-day", groups.allDay, `${section.id}:all-day`)}
        {renderActivityGroup("Timeline", groups.timeline, `${section.id}:timeline`, nowMarkerPlacement)}
        {renderActivityGroup("Flexible", groups.flexible, `${section.id}:flexible`)}
      </div>
    );
  }

  function renderCollapsedSummary(section: TimelineSection) {
    const groups = groupActivitiesForDay(section.activities);
    const nextActivity = getNextScheduledActivity(groups);

    return (
      <button
        type="button"
        className="flex w-full flex-col gap-1 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50"
        onClick={() => focusSection(section.id)}
      >
        <span className="font-medium text-foreground">{summarizeGroups(groups)}</span>
        {nextActivity && (
          <span className="text-muted-foreground">
            Next: {formatActivityTime(nextActivity)} - {nextActivity.title}
          </span>
        )}
      </button>
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
      {(canCreateSections || canManageCustomTypes) && (
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

      {!hasAnyActivity && <TimelineEmptyState canEdit={canEdit} />}

      <div className="space-y-4">
        {timelineData.sections.map((section) => {
          const isFocused = effectiveFocusedSectionId === section.id;
          const isOpen = visibleOpenSectionIds.has(section.id);
          const datePosition = sectionPositionLabel(section.section_date, timelineData.trip_timezone);

          return (
            <section key={section.id} className="relative pl-7">
              <div className="absolute bottom-[-1rem] left-[7px] top-5 w-px bg-border" />
              <span
                className={`absolute left-0 top-1 size-4 rounded-full border-2 bg-background ${
                  isFocused ? "border-primary" : "border-border"
                }`}
              />
              <div className="space-y-3">
                <header className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-2 text-left"
                    aria-expanded={isOpen}
                    onClick={() => toggleSection(section.id, isOpen, isFocused)}
                  >
                    {isOpen ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-sm font-semibold">{section.label}</span>
                    {isFocused && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase text-primary">
                        Focused
                      </span>
                    )}
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="size-3" />
                      {section.section_date}
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                      {datePosition}
                    </span>
                    {canEdit && (
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
                        <Button
                          type="button"
                          size="xs"
                          onClick={() => openActivityModal({ kind: "create", sectionId: section.id })}
                        >
                          <Plus className="size-3" />
                          Add activity
                        </Button>
                      </>
                    )}
                  </div>
                </header>

                {isOpen ? renderSectionContent(section) : renderCollapsedSummary(section)}
              </div>
            </section>
          );
        })}
      </div>

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
