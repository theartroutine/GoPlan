"use client";

import { useEffect, useState } from "react";

import type { AIActionDraft } from "@/features/chat/domain/ai-action-drafts";
import {
  cancelAIActionDraft,
  confirmAIActionDraft,
  patchAIActionDraft,
} from "@/features/chat/infrastructure/ai-action-drafts-api";
import { useTripContext } from "@/features/trips/presentation/trip-context";

import { CardActions } from "./card-actions";
import { FieldEditor } from "./field-editor";
import type { CardProps, CardRenderer } from "./display-types";
import { ExpenseCard } from "./renderers/expense-card";
import { GenericCard } from "./renderers/generic-card";
import { SettlementCard } from "./renderers/settlement-card";
import { TimelineActivityCard } from "./renderers/timeline-activity-card";
import { TransferCard } from "./renderers/transfer-card";

const RENDERERS: Array<{ prefix: string; renderer: CardRenderer }> = [
  { prefix: "timeline.activity.", renderer: TimelineActivityCard },
  { prefix: "expense.", renderer: ExpenseCard },
  { prefix: "settlement.transfer.", renderer: TransferCard },
  { prefix: "settlement.", renderer: SettlementCard },
];

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
    typeof value.status === "string"
  );
}

function draftFromError(error: unknown): AIActionDraft | null {
  const data = errorResponseData(error);
  if (!data) return null;
  return isAIActionDraft(data.draft) ? (data.draft as AIActionDraft) : null;
}

function errorMessage(error: unknown, fallback: string): string {
  const data = errorResponseData(error);
  if (typeof data?.detail === "string") return data.detail;
  return fallback;
}

export function AIActionCard(props: CardProps) {
  const { tripId, draft, onDraftChanged } = props;
  const trip = useTripContext();
  const tripTimezone = trip.data?.trip.timezone;
  const [localDraft, setLocalDraft] = useState(draft);
  const [pending, setPending] = useState<"confirm" | "cancel" | "patch" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalDraft(draft);
  }, [draft]);

  function applyDraft(next: AIActionDraft) {
    setLocalDraft(next);
    onDraftChanged(next);
  }

  async function handleConfirm() {
    if (pending !== null) return;
    setPending("confirm");
    setError(null);
    try {
      const res = await confirmAIActionDraft(tripId, localDraft.id);
      applyDraft(res.draft);
    } catch (caught) {
      const next = draftFromError(caught);
      if (next) applyDraft(next);
      setError(errorMessage(caught, "Không xác nhận được draft này."));
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
      const next = draftFromError(caught);
      if (next) applyDraft(next);
      setError(errorMessage(caught, "Không hủy được draft này."));
    } finally {
      setPending(null);
    }
  }

  async function handlePatch(payload: Record<string, unknown>) {
    if (pending !== null) throw new Error("already pending");
    setPending("patch");
    setError(null);
    try {
      const res = await patchAIActionDraft(tripId, localDraft.id, payload);
      applyDraft(res.draft);
    } catch (caught) {
      const next = draftFromError(caught);
      if (next) applyDraft(next);
      const detail = errorMessage(caught, "");
      if (detail) setError(detail);
      throw caught;
    } finally {
      setPending(null);
    }
  }

  const renderer =
    RENDERERS.find((r) => localDraft.action_type.startsWith(r.prefix))
      ?.renderer ?? GenericCard;

  const editorSlot =
    localDraft.status === "NEEDS_INFO" && localDraft.can_edit ? (
      <FieldEditor
        fields={localDraft.missing_fields}
        pending={pending === "patch"}
        tripTimezone={tripTimezone}
        onSave={handlePatch}
      />
    ) : null;

  const actionsSlot = (
    <CardActions
      draft={localDraft}
      pending={pending}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return renderer({
    tripId,
    draft: localDraft,
    onDraftChanged,
    editorSlot,
    actionsSlot,
    helperOverride: null,
    errorOverride: error,
  });
}
