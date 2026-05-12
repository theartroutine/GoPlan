import { bff } from "@/shared/http/bff-client";

import type {
  ChatGapFillResponse,
  ChatHistoryResponse,
  ChatMessage,
  ChatUpdateSyncResponse,
  DeleteChatMessageMode,
  HideChatMessagesResult,
  ReactionSummary,
  SendChatMessageInput,
  SendChatMessageResult,
} from "@/features/chat/domain/types";

const HISTORY_DEFAULT_LIMIT = 30;
const GAP_FILL_DEFAULT_LIMIT = 100;

function chatBasePath(tripId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/chat/messages`;
}

function reactionBasePath(tripId: string, messageId: string): string {
  return `${chatBasePath(tripId)}/${encodeURIComponent(messageId)}/reactions`;
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

export type SyncUpdatedChatOptions = {
  updated_since: string;
  updated_since_id?: string;
  limit?: number;
};

/**
 * `GET .../messages?updated_since=&limit=` — ascending mutation catch-up page.
 * This covers updates to already-known messages, such as reactions and delete
 * tombstones, which `since=<message_id>` cannot see.
 */
export async function bffSyncUpdatedChatMessages(
  tripId: string,
  options: SyncUpdatedChatOptions,
): Promise<ChatUpdateSyncResponse> {
  const params: Record<string, string | number> = {
    updated_since: options.updated_since,
    limit: options.limit ?? GAP_FILL_DEFAULT_LIMIT,
  };
  if (options.updated_since_id) params.updated_since_id = options.updated_since_id;

  const res = await bff.get<ChatUpdateSyncResponse>(chatBasePath(tripId), {
    params,
  });
  return res.data;
}

export async function bffAddReaction(
  tripId: string,
  messageId: string,
  emoji: string,
): Promise<ReactionSummary[]> {
  const res = await bff.post<{ reactions: ReactionSummary[] }>(
    reactionBasePath(tripId, messageId),
    { emoji },
  );
  return res.data.reactions;
}

export async function bffRemoveReaction(
  tripId: string,
  messageId: string,
  emoji: string,
): Promise<ReactionSummary[]> {
  const res = await bff.delete<{ reactions: ReactionSummary[] }>(
    `${reactionBasePath(tripId, messageId)}/${encodeURIComponent(emoji)}`,
  );
  return res.data.reactions;
}

export async function bffDeleteChatMessage(
  tripId: string,
  messageId: string,
  mode: DeleteChatMessageMode,
): Promise<{ message: ChatMessage } | HideChatMessagesResult> {
  const res = await bff.delete<{ message: ChatMessage } | HideChatMessagesResult>(
    `${chatBasePath(tripId)}/${encodeURIComponent(messageId)}`,
    { data: { mode } },
  );
  return res.data;
}

export async function bffHideChatMessagesForMe(
  tripId: string,
  messageIds: string[],
): Promise<HideChatMessagesResult> {
  const res = await bff.post<HideChatMessagesResult>(
    `${chatBasePath(tripId)}/hide`,
    { message_ids: messageIds },
  );
  return res.data;
}
