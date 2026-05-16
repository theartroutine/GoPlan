"use client";

import type { CardProps } from "../display-types";
import { CardShell } from "../card-shell";

export function GenericCard({
  draft,
  editorSlot,
  actionsSlot,
  helperOverride,
  errorOverride,
}: CardProps) {
  return (
    <CardShell
      display={draft.display}
      status={draft.status}
      editorSlot={editorSlot}
      actionsSlot={actionsSlot}
      helper={helperOverride}
      error={errorOverride}
    />
  );
}
