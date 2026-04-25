"use client";

import axios from "axios";
import { useCallback, useEffect, useState } from "react";

import type { TimelineResponse } from "@/features/trips/domain/types";
import { bffGetTimeline } from "@/features/trips/infrastructure/trips-api";
import { TimelineSectionList } from "@/features/trips/presentation/timeline-section-list";
import { useTripContext } from "@/features/trips/presentation/trip-context";

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

export function TimelineTab() {
  const { tripId } = useTripContext();
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await bffGetTimeline(tripId, signal);
      setData(result);
    } catch (err: unknown) {
      if (signal.aborted || axios.isCancel(err)) return;
      setError("Failed to load timeline.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (loading && !data) return <TimelineSkeleton />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;

  const hasAnyActivity = data.sections.some((section) => section.activities.length > 0);
  if (!hasAnyActivity) {
    return <TimelineEmptyState canEdit={data.permissions.can_edit_timeline} />;
  }

  return <TimelineSectionList sections={data.sections} />;
}
