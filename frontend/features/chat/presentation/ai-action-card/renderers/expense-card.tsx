"use client";

import type { CardProps } from "../display-types";
import { CardShell } from "../card-shell";

export function ExpenseCard({
  draft,
  editorSlot,
  actionsSlot,
  helperOverride,
  errorOverride,
}: CardProps) {
  const hero = draft.display.hero;
  const meta = draft.display.meta ?? [];
  return (
    <CardShell
      display={draft.display}
      status={draft.status}
      editorSlot={editorSlot}
      actionsSlot={actionsSlot}
      helper={helperOverride}
      error={errorOverride}
    >
      {hero && hero.kind === "amount" ? (
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight">{hero.value}</span>
          <span className="text-xs text-muted-foreground">{hero.currency}</span>
        </div>
      ) : null}
      {meta.length ? (
        <dl className="mt-2 space-y-0.5 text-xs">
          {meta.map((m) => (
            <div key={m.label} className="flex gap-2">
              <dt className="text-muted-foreground">{m.label}:</dt>
              <dd className="break-words">{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </CardShell>
  );
}
