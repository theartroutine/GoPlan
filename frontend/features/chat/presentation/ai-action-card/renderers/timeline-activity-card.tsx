"use client";

import type { CardProps } from "../display-types";
import { CardShell } from "../card-shell";
import { Chip } from "../chip";

export function TimelineActivityCard({
  draft,
  editorSlot,
  actionsSlot,
  helperOverride,
  errorOverride,
}: CardProps) {
  const chips = draft.display.chips ?? [];
  return (
    <CardShell
      display={draft.display}
      status={draft.status}
      editorSlot={editorSlot}
      actionsSlot={actionsSlot}
      helper={helperOverride}
      error={errorOverride}
    >
      {chips.length ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <Chip key={`${c.label}-${i}`} icon={c.icon} label={c.label} />
          ))}
        </div>
      ) : null}
    </CardShell>
  );
}
