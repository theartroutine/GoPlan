import { bff } from "@/shared/http/bff-client";

import type { AIActionDraftEnvelope } from "@/features/chat/domain/ai-action-drafts";

function draftPath(tripId: string, draftId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/ai/action-drafts/${encodeURIComponent(draftId)}`;
}

export async function getAIActionDraft(
  tripId: string,
  draftId: string,
): Promise<AIActionDraftEnvelope> {
  const res = await bff.get<AIActionDraftEnvelope>(draftPath(tripId, draftId));
  return res.data;
}

export async function patchAIActionDraft(
  tripId: string,
  draftId: string,
  payload: Record<string, unknown>,
): Promise<AIActionDraftEnvelope> {
  const res = await bff.patch<AIActionDraftEnvelope>(
    draftPath(tripId, draftId),
    { payload },
  );
  return res.data;
}

export async function confirmAIActionDraft(
  tripId: string,
  draftId: string,
): Promise<AIActionDraftEnvelope> {
  const res = await bff.post<AIActionDraftEnvelope>(
    `${draftPath(tripId, draftId)}/confirm`,
  );
  return res.data;
}

export async function cancelAIActionDraft(
  tripId: string,
  draftId: string,
): Promise<AIActionDraftEnvelope> {
  const res = await bff.post<AIActionDraftEnvelope>(
    `${draftPath(tripId, draftId)}/cancel`,
  );
  return res.data;
}
