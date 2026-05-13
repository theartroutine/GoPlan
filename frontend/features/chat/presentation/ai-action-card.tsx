"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { AIActionDraft } from "@/features/chat/domain/ai-action-drafts";
import {
  cancelAIActionDraft,
  confirmAIActionDraft,
  patchAIActionDraft,
} from "@/features/chat/infrastructure/ai-action-drafts-api";
import { AIActionFieldEditor } from "@/features/chat/presentation/ai-action-field-editor";
import { Button } from "@/shared/ui/button";

type Props = {
  tripId: string;
  draft: AIActionDraft;
  onDraftChanged: (draft: AIActionDraft) => void;
};

function titleForAction(actionType: string): string {
  if (actionType.startsWith("expense.")) return "Expense draft";
  if (actionType.startsWith("timeline.")) return "Timeline draft";
  if (actionType.startsWith("settlement.transfer.")) return "Transfer action";
  if (actionType.startsWith("settlement.")) return "Settlement action";
  return "AI action";
}

function previewEntries(preview: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(preview).map(([key, value]) => [
    key.replaceAll("_", " "),
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
}

function errorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object" &&
    "data" in error.response &&
    error.response.data &&
    typeof error.response.data === "object" &&
    "detail" in error.response.data &&
    typeof error.response.data.detail === "string"
  ) {
    return error.response.data.detail;
  }
  return fallback;
}

export function AIActionCard({ tripId, draft, onDraftChanged }: Props) {
  const [localDraft, setLocalDraft] = useState(draft);
  const [pending, setPending] = useState<"confirm" | "cancel" | "patch" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalDraft(draft);
  }, [draft]);

  function applyDraft(nextDraft: AIActionDraft) {
    setLocalDraft(nextDraft);
    onDraftChanged(nextDraft);
  }

  async function handleConfirm() {
    if (pending !== null) return;
    setPending("confirm");
    setError(null);
    try {
      const res = await confirmAIActionDraft(tripId, localDraft.id);
      applyDraft(res.draft);
    } catch (caught) {
      setError(errorMessage(caught, "Could not confirm this draft."));
    } finally {
      setPending(null);
    }
  }

  async function handleCancel() {
    if (pending !== null) return;
    setPending("cancel");
    setError(null);
    try {
      const res = await cancelAIActionDraft(tripId, localDraft.id);
      applyDraft(res.draft);
    } catch (caught) {
      setError(errorMessage(caught, "Could not cancel this draft."));
    } finally {
      setPending(null);
    }
  }

  async function handlePatch(payload: Record<string, unknown>) {
    if (pending !== null) return;
    setPending("patch");
    setError(null);
    try {
      const res = await patchAIActionDraft(tripId, localDraft.id, payload);
      applyDraft(res.draft);
    } catch (caught) {
      setError(errorMessage(caught, "Could not update this draft."));
    } finally {
      setPending(null);
    }
  }

  const title =
    localDraft.preview.title !== undefined
      ? String(localDraft.preview.title)
      : localDraft.action_type;

  const canShowReadyActions =
    localDraft.status === "READY" &&
    (localDraft.can_confirm || localDraft.can_cancel);

  return (
    <div className="mt-2 rounded-lg border border-border bg-background p-3 text-sm text-foreground shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            {titleForAction(localDraft.action_type)}
          </div>
          <div className="break-words font-semibold">{title}</div>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {localDraft.status.replaceAll("_", " ")}
        </span>
      </div>

      <dl className="grid grid-cols-[minmax(5rem,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1">
        {previewEntries(localDraft.preview).map(([label, value]) => (
          <div className="contents" key={label}>
            <dt className="capitalize text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      {localDraft.status === "NEEDS_INFO" && localDraft.can_cancel ? (
        <AIActionFieldEditor
          fields={localDraft.missing_fields}
          pending={pending === "patch"}
          onSave={handlePatch}
        />
      ) : null}

      {localDraft.status === "READY" && !localDraft.can_confirm ? (
        <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
          Waiting for the authorized member to confirm.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

      {canShowReadyActions ? (
        <div className="mt-3 flex justify-end gap-2">
          {localDraft.can_cancel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={pending !== null}
            >
              <X className="size-3.5" />
              Cancel
            </Button>
          ) : null}
          {localDraft.can_confirm ? (
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={pending !== null}
            >
              <Check className="size-3.5" />
              Confirm
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
