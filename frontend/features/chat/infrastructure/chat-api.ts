import { bff } from "@/shared/http/bff-client";

import type {
  ChatGapFillResponse,
  ChatHistoryResponse,
  ChatMessage,
  SendChatMessageInput,
  SendChatMessageResult,
} from "@/features/chat/domain/types";

const HISTORY_DEFAULT_LIMIT = 30;
const GAP_FILL_DEFAULT_LIMIT = 100;

function chatBasePath(tripId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/chat/messages`;
}

/**
 * `POST /api/trips/<trip_id>/chat/messages` — see issue #14 REST contract.
 * Resolves to {message, status} so the caller can distinguish between a
 * freshly-created row (201) and an idempotent retry hit (200).
 */
export async function bffSendChatMessage(
  tripId: string,
  input: SendChatMessageInput,
): Promise<SendChatMessageResult> {
  const res = await bff.post<{ message: ChatMessage }>(
    chatBasePath(tripId),
    input,
  );
  const status: 200 | 201 = res.status === 201 ? 201 : 200;
  return { message: res.data.message, status };
}

export type ListChatHistoryOptions = {
  cursor?: string;
  limit?: number;
};

/**
 * `GET .../messages?cursor=&limit=` — descending history page.
 * Mutually exclusive with `bffGapFillChatMessages` (issue #14 contract).
 */
export async function bffListChatHistory(
  tripId: string,
  options: ListChatHistoryOptions = {},
): Promise<ChatHistoryResponse> {
  const params: Record<string, string | number> = {
    limit: options.limit ?? HISTORY_DEFAULT_LIMIT,
  };
  if (options.cursor) params.cursor = options.cursor;

  const res = await bff.get<ChatHistoryResponse>(chatBasePath(tripId), {
    params,
  });
  return res.data;
}

export type GapFillChatOptions = {
  since: string;
  limit?: number;
};

/**
 * `GET .../messages?since=&limit=` — ascending gap-fill page.
 * The hook keeps calling this with the latest received message id until
 * `has_more === false`.
 */
export async function bffGapFillChatMessages(
  tripId: string,
  options: GapFillChatOptions,
): Promise<ChatGapFillResponse> {
  const res = await bff.get<ChatGapFillResponse>(chatBasePath(tripId), {
    params: {
      since: options.since,
      limit: options.limit ?? GAP_FILL_DEFAULT_LIMIT,
    },
  });
  return res.data;
}
