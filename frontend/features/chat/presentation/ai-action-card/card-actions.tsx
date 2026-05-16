"use client";

import { Check, X } from "lucide-react";

import type { AIActionDraft } from "@/features/chat/domain/ai-action-drafts";
import { Button } from "@/shared/ui/button";

type Props = {
  draft: AIActionDraft;
  pending: "confirm" | "cancel" | "patch" | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function CardActions({ draft, pending, onConfirm, onCancel }: Props) {
  if (draft.status !== "READY") return null;
  if (!draft.can_confirm && !draft.can_cancel) return null;
  return (
    <div className="mt-3 flex justify-end gap-2">
      {draft.can_cancel ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending !== null}
          onClick={onCancel}
        >
          <X className="size-3.5" /> Cancel
        </Button>
      ) : null}
      {draft.can_confirm ? (
        <Button
          type="button"
          size="sm"
          disabled={pending !== null}
          onClick={onConfirm}
          className="bg-emerald-600 ring-2 ring-emerald-200 hover:bg-emerald-700"
        >
          <Check className="size-3.5" /> Confirm
        </Button>
      ) : null}
    </div>
  );
}
