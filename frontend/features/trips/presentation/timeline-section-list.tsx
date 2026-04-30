"use client";

import type { TimelineSection } from "@/features/trips/domain/types";
import { TimelineActivityNode } from "@/features/trips/presentation/timeline-activity-node";

export function TimelineSectionList({ sections }: { sections: TimelineSection[] }) {
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.id} className="space-y-3">
          <header className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">{section.label}</h3>
            <span className="text-xs text-muted-foreground">{section.section_date}</span>
          </header>
          {section.activities.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
              No activities yet.
            </p>
          ) : (
            <ol className="space-y-2">
              {section.activities.map((activity) => (
                <li key={activity.id}>
                  <TimelineActivityNode activity={activity} />
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
