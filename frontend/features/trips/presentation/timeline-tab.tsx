"use client";

import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  bffReorderTimelineActivities,
  bffReorderTimelineSections,
  bffUpdateTimelineActivityStatus,
} from "@/features/trips/infrastructure/trips-api";
import { TimelineActivityForm } from "@/features/trips/presentation/timeline-activity-form";
import { TimelineActivityNode } from "@/features/trips/presentation/timeline-activity-node";
import { TimelineCustomTypeManager } from "@/features/trips/presentation/timeline-custom-type-manager";
import { TimelineReorderControls } from "@/features/trips/presentation/timeline-reorder-controls";
import { TimelineSectionForm } from "@/features/trips/presentation/timeline-section-form";
import { useTripContext } from "@/features/trips/presentation/trip-context";
import { Button } from "@/shared/ui/button";

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

type ActivityEditorState =
  | { kind: "closed" }
  | { kind: "create"; sectionId: string }
  | { kind: "edit"; activity: TimelineActivity };

export function TimelineTab() {
  const { tripId, data: tripData } = useTripContext();
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showSectionForm, setShowSectionForm] = useState(false);
  const [editingSection, setEditingSection] = useState<TimelineSection | null>(null);
  const [showCustomTypes, setShowCustomTypes] = useState(false);
  const [activityEditor, setActivityEditor] = useState<ActivityEditorState>({ kind: "closed" });

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

  if (loading && !data) return <TimelineSkeleton />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;

  const canEdit = data.permissions.can_edit_timeline;
  const hasAnyActivity = data.sections.some((section) => section.activities.length > 0);

  // -------- Section handlers --------
  async function handleCreateSection(payload: { label: string; section_date?: string }) {
    if (!payload.section_date) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await bffCreateTimelineSection(tripId, {
        section_date: payload.section_date,
        label: payload.label,
      });
      setShowSectionForm(false);
      await refetch();
    } catch (err) {
      setActionError(extractError(err, "Failed to create section."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePatchSection(section: TimelineSection, payload: { label: string; section_date?: string }) {
    setSubmitting(true);
    setActionError(null);
    try {
      await bffPatchTimelineSection(tripId, section.id, payload);
      setEditingSection(null);
      await refetch();
    } catch (err) {
      setActionError(extractError(err, "Failed to update section."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteSection(section: TimelineSection) {
    if (!window.confirm(`Delete section "${section.label}"?`)) return;
    setActionError(null);
    try {
      await bffDeleteTimelineSection(tripId, section.id);
      await refetch();
    } catch (err) {
      setActionError(extractError(err, "Failed to delete section."));
    }
  }

  async function handleReorderSections(sectionDate: string, orderedIds: string[]) {
    setActionError(null);
    try {
      await bffReorderTimelineSections(tripId, {
        section_date: sectionDate,
        ordered_section_ids: orderedIds,
      });
      await refetch();
    } catch (err) {
      setActionError(extractError(err, "Failed to reorder sections."));
    }
  }

  // -------- Activity handlers --------
  async function handleCreateActivity(sectionId: string, payload: CreateActivityPayload) {
    setSubmitting(true);
    setActionError(null);
    try {
      await bffCreateTimelineActivity(tripId, sectionId, payload);
      setActivityEditor({ kind: "closed" });
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
      setActivityEditor({ kind: "closed" });
      await refetch();
    } catch (err) {
      setActionError(extractError(err, "Failed to update activity."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteActivity(activity: TimelineActivity) {
    if (!window.confirm(`Delete activity "${activity.title}"?`)) return;
    setActionError(null);
    try {
      await bffDeleteTimelineActivity(tripId, activity.id);
      await refetch();
    } catch (err) {
      setActionError(extractError(err, "Failed to delete activity."));
    }
  }

  async function handleReorderActivities(sectionId: string, orderedIds: string[]) {
    setActionError(null);
    try {
      await bffReorderTimelineActivities(tripId, sectionId, {
        ordered_activity_ids: orderedIds,
      });
      await refetch();
    } catch (err) {
      setActionError(extractError(err, "Failed to reorder activities."));
    }
  }

  async function handleUpdateActivityStatus(activity: TimelineActivity, status: TimelineActivity["status"]) {
    setActionError(null);
    try {
      await bffUpdateTimelineActivityStatus(tripId, activity.id, { status });
      await refetch();
    } catch (err) {
      setActionError(extractError(err, "Failed to update activity status."));
    }
  }

  // -------- Render --------
  // Group sections by date for sibling reorder scope.
  const sectionsByDate = new Map<string, TimelineSection[]>();
  for (const section of data.sections) {
    const list = sectionsByDate.get(section.section_date) ?? [];
    list.push(section);
    sectionsByDate.set(section.section_date, list);
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => setShowSectionForm((v) => !v)}>
            {showSectionForm ? "Close" : "Add special day"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowCustomTypes((v) => !v)}
          >
            {showCustomTypes ? "Close types" : "Manage types"}
          </Button>
        </div>
      )}

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {canEdit && showSectionForm && (
        <TimelineSectionForm
          submitting={submitting}
          onCancel={() => setShowSectionForm(false)}
          onSubmit={handleCreateSection}
        />
      )}

      {canEdit && showCustomTypes && (
        <TimelineCustomTypeManager
          tripId={tripId}
          customTypes={data.custom_types}
          onChanged={refetch}
        />
      )}

      {!hasAnyActivity && <TimelineEmptyState canEdit={canEdit} />}

      <div className="space-y-6">
        {data.sections.map((section) => {
          const siblings = sectionsByDate.get(section.section_date) ?? [];
          const sectionIndex = siblings.findIndex((s) => s.id === section.id);
          const editingThisSection = editingSection?.id === section.id;
          return (
            <section key={section.id} className="space-y-3">
              <header className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                  {canEdit && siblings.length > 1 && (
                    <TimelineReorderControls
                      index={sectionIndex}
                      total={siblings.length}
                      onMoveUp={() => {
                        const ids = siblings.map((s) => s.id);
                        [ids[sectionIndex - 1], ids[sectionIndex]] = [ids[sectionIndex], ids[sectionIndex - 1]];
                        void handleReorderSections(section.section_date, ids);
                      }}
                      onMoveDown={() => {
                        const ids = siblings.map((s) => s.id);
                        [ids[sectionIndex], ids[sectionIndex + 1]] = [ids[sectionIndex + 1], ids[sectionIndex]];
                        void handleReorderSections(section.section_date, ids);
                      }}
                    />
                  )}
                  <h3 className="text-sm font-semibold">{section.label}</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{section.section_date}</span>
                  {canEdit && (
                    <>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => setEditingSection(editingThisSection ? null : section)}
                      >
                        {editingThisSection ? "Close" : "Edit"}
                      </Button>
                      {section.kind === "SPECIAL_DAY" && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => handleDeleteSection(section)}
                        >
                          Delete
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="xs"
                        onClick={() => setActivityEditor({ kind: "create", sectionId: section.id })}
                      >
                        Add activity
                      </Button>
                    </>
                  )}
                </div>
              </header>

              {canEdit && editingThisSection && (
                <TimelineSectionForm
                  initial={section}
                  submitting={submitting}
                  onCancel={() => setEditingSection(null)}
                  onSubmit={(payload) => handlePatchSection(section, payload)}
                />
              )}

              {canEdit && activityEditor.kind === "create" && activityEditor.sectionId === section.id && (
                <TimelineActivityForm
                  members={members}
                  systemTypes={data.system_types}
                  customTypes={data.custom_types}
                  submitting={submitting}
                  errorMessage={actionError}
                  onCancel={() => setActivityEditor({ kind: "closed" })}
                  onSubmit={(payload) => handleCreateActivity(section.id, payload as CreateActivityPayload)}
                />
              )}

              {section.activities.length === 0 ? (
                <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
                  No activities yet.
                </p>
              ) : (
                <ol className="space-y-2">
                  {section.activities.map((activity, idx) => {
                    const editingThis = activityEditor.kind === "edit" && activityEditor.activity.id === activity.id;
                    return (
                      <li key={activity.id} className="space-y-2">
                        <div className="flex items-stretch gap-2">
                          {canEdit && section.activities.length > 1 && (
                            <TimelineReorderControls
                              index={idx}
                              total={section.activities.length}
                              onMoveUp={() => {
                                const ids = section.activities.map((a) => a.id);
                                [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
                                void handleReorderActivities(section.id, ids);
                              }}
                              onMoveDown={() => {
                                const ids = section.activities.map((a) => a.id);
                                [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
                                void handleReorderActivities(section.id, ids);
                              }}
                            />
                          )}
                          <div className="flex-1">
                            <TimelineActivityNode
                              activity={activity}
                              onStatusChange={(nextStatus) => handleUpdateActivityStatus(activity, nextStatus)}
                            />
                          </div>
                          {canEdit && (
                            <div className="flex flex-col gap-1">
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                onClick={() =>
                                  setActivityEditor(editingThis ? { kind: "closed" } : { kind: "edit", activity })
                                }
                              >
                                {editingThis ? "Close" : "Edit"}
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                onClick={() => handleDeleteActivity(activity)}
                              >
                                Delete
                              </Button>
                            </div>
                          )}
                        </div>
                        {canEdit && editingThis && (
                          <TimelineActivityForm
                            members={members}
                            systemTypes={data.system_types}
                            customTypes={data.custom_types}
                            initial={activity}
                            submitting={submitting}
                            errorMessage={actionError}
                            onCancel={() => setActivityEditor({ kind: "closed" })}
                            onSubmit={(payload) => handlePatchActivity(activity, payload)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
