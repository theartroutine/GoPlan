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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResponseData(error: unknown): Record<string, unknown> | null {
  const response = isRecord(error) ? error.response : null;
  const data = isRecord(response) ? response.data : null;
  return isRecord(data) ? data : null;
}

function isAIActionDraft(value: unknown): value is AIActionDraft {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.action_type === "string" &&
    typeof value.status === "string" &&
    typeof value.required_confirmation === "string" &&
    typeof value.can_confirm === "boolean" &&
    typeof value.can_cancel === "boolean" &&
    isRecord(value.preview) &&
    Array.isArray(value.missing_fields) &&
    isRecord(value.result) &&
    typeof value.error_code === "string" &&
    typeof value.error_detail === "string" &&
    typeof value.expires_at === "string" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

function draftFromError(error: unknown): AIActionDraft | null {
  const data = errorResponseData(error);
  if (!data) return null;
  return isAIActionDraft(data.draft) ? data.draft : null;
}

function errorMessage(error: unknown, fallback: string): string {
  const data = errorResponseData(error);
  if (typeof data?.detail === "string") return data.detail;
  return fallback;
}

function statusMessage(draft: AIActionDraft): string | null {
  if (draft.status === "READY" && !draft.can_confirm) {
    return "Waiting for the authorized member to confirm.";
  }
  if (draft.status === "EXPIRED") {
    return "This draft expired. Ask GoPlanAI to regenerate it.";
  }
  if (draft.status === "FAILED") {
    return draft.error_detail || "This draft failed. Ask GoPlanAI to regenerate it.";
  }
  return null;
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
      const nextDraft = draftFromError(caught);
      if (nextDraft) applyDraft(nextDraft);
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
      const nextDraft = draftFromError(caught);
      if (nextDraft) applyDraft(nextDraft);
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
      const nextDraft = draftFromError(caught);
      if (nextDraft) applyDraft(nextDraft);
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
  const helperText = statusMessage(localDraft);

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

      {helperText ? (
        <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
          {helperText}
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
