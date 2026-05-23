"use client";

import type { ReactNode } from "react";

import type {
  AIActionDisplay,
  AIActionDraft,
} from "@/features/chat/domain/ai-action-drafts";

import { ActionIcon } from "./action-icon";
import { StatusPill } from "./status-pill";

type Props = {
  display: AIActionDisplay;
  status: AIActionDraft["status"];
  error?: string | null;
  helper?: string | null;
  editorSlot?: ReactNode;
  actionsSlot?: ReactNode;
  children?: ReactNode;
};

export function CardShell({
  display,
  status,
  error,
  helper,
  editorSlot,
  actionsSlot,
  children,
}: Props) {
  return (
    <div className="mt-2 rounded-lg border border-border bg-background p-3 text-sm text-foreground shadow-sm">
      <div className="mb-2 flex items-start gap-3">
        <ActionIcon icon={display.icon} />
        <div className="min-w-0 flex-1">
          <div className="break-words font-semibold leading-snug">
            {display.title}
          </div>
        </div>
        <StatusPill status={status} />
      </div>
      {children}
      {editorSlot}
      {helper ? (
        <p className="mt-3 border-t border-border pt-2 text-xs text-emerald-700">
          {helper}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      {actionsSlot}
    </div>
  );
}
