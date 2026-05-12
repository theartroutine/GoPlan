"use client";

import axios from "axios";
import { useCallback, useEffect, useReducer, useRef } from "react";

import type { AxiosError } from "axios";

import {
  bffAddReaction,
  bffDeleteChatMessage,
  bffGapFillChatMessages,
  bffHideChatMessagesForMe,
  bffListChatHistory,
  bffRemoveReaction,
  bffSendChatMessage,
  bffSyncUpdatedChatMessages,
} from "@/features/chat/infrastructure/chat-api";
import { joinChatRoom } from "@/features/chat/infrastructure/chat-ws-bridge";

import type {
  ChatMessage,
  DeleteChatMessageMode,
  ReactionSummary,
  WsChatAITypingStarted,
  WsChatAITypingStopped,
  WsChatError,
  WsChatMessageDeleted,
  WsChatMessagePush,
  WsChatReactionUpdate,
} from "@/features/chat/domain/types";

const HISTORY_PAGE_SIZE = 30;
const GAP_FILL_PAGE_SIZE = 100;
const GAP_FILL_MAX_PAGES = 50; // hard upper bound to avoid infinite loops
const ROOM_ACCESS_LOST_ERROR_CODES = new Set(["TRIP_NOT_FOUND", "FORBIDDEN"]);

export type ChatRoomStatus = "loading" | "ready" | "error" | "kicked";
type SendLockReason = "terminal";

type SendOutcome = "ok" | "duplicate" | "failed";
type UpdatedSyncCursor = { updatedAt: string; id: string };

export type UseTripChatResult = {
  status: ChatRoomStatus;
  errorCode: string | null;
  /** Messages in ascending order by (created_at, id). Includes optimistic. */
  messages: ChatMessage[];
  /** Set of client_message_ids that haven't been confirmed by server yet. */
  pendingClientIds: Set<string>;
  /** Set of client_message_ids whose POST resolved with an error. */
  failedClientIds: Set<string>;
  sendLockReason: SendLockReason | null;
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  isSending: boolean;
  isAITyping: boolean;
  loadOlder: () => Promise<void>;
  sendMessage: (content: string) => Promise<SendOutcome>;
  retryPending: (clientMessageId: string) => Promise<SendOutcome>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  deleteMessage: (messageId: string, mode: DeleteChatMessageMode) => Promise<void>;
  hideMessagesForMe: (messageIds: string[]) => Promise<void>;
};

type ChatState = {
  status: ChatRoomStatus;
  errorCode: string | null;
  /** id → message, source of truth for confirmed (server-acknowledged) messages. */
  confirmed: Map<string, ChatMessage>;
  /** client_message_id → optimistic ChatMessage, replaced once confirmed. */
  pending: Map<string, ChatMessage>;
  /** Server ids hidden in this session through "remove for me". */
  hidden: Set<string>;
  failed: Set<string>;
  sendLockReason: SendLockReason | null;
  hasMoreOlder: boolean;
  nextOlderCursor: string | null;
  isLoadingOlder: boolean;
  isSending: boolean;
  activeAIInteractionId: string | null;
  aiTypingRequestedByUserId: string | null;
};

type ChatAction =
  | { type: "INIT_START" }
  | {
      type: "INIT_SUCCESS";
      messages: ChatMessage[];
      nextCursor: string | null;
    }
  | { type: "INIT_ERROR"; errorCode: string }
  | { type: "LOAD_OLDER_START" }
  | {
      type: "LOAD_OLDER_SUCCESS";
      messages: ChatMessage[];
      nextCursor: string | null;
    }
  | { type: "LOAD_OLDER_ERROR" }
  | { type: "UPSERT_CONFIRMED"; messages: ChatMessage[] }
  | { type: "PATCH_CONFIRMED"; messages: ChatMessage[] }
  | { type: "ADD_PENDING"; message: ChatMessage }
  | { type: "CONFIRM_PENDING"; clientMessageId: string; message: ChatMessage }
  | { type: "FAIL_PENDING"; clientMessageId: string }
  | { type: "CLEAR_FAILED"; clientMessageId: string }
  | { type: "LOCK_SEND_TERMINAL"; clientMessageId?: string }
  | { type: "SEND_START" }
  | { type: "SEND_END" }
  | { type: "KICKED" }
  | { type: "WS_ERROR"; errorCode: string }
  | { type: "CLEAR_ROOM_ERROR" }
  | { type: "UPDATE_REACTIONS"; messageId: string; reactions: ReactionSummary[] }
  | { type: "HIDE_MESSAGES"; messageIds: string[] }
  | { type: "AI_TYPING_STARTED"; interactionId: string; requestedByUserId: string | null }
  | { type: "AI_TYPING_STOPPED"; interactionId: string }
  | { type: "DROP_PENDING"; clientMessageId: string };

function initialState(): ChatState {
  return {
    status: "loading",
    errorCode: null,
    confirmed: new Map(),
    pending: new Map(),
    hidden: new Set(),
    failed: new Set(),
    sendLockReason: null,
    hasMoreOlder: false,
    nextOlderCursor: null,
    isLoadingOlder: false,
    isSending: false,
    activeAIInteractionId: null,
    aiTypingRequestedByUserId: null,
  };
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "INIT_START":
      return { ...initialState() };

    case "INIT_SUCCESS": {
      const confirmed = new Map(state.confirmed);
      const pending = new Map(state.pending);
      const failed = new Set(state.failed);
      for (const m of action.messages) {
        if (state.hidden.has(m.id)) continue;
        confirmed.set(m.id, m);
        if (m.client_message_id) {
          pending.delete(m.client_message_id);
          failed.delete(m.client_message_id);
        }
      }
      return {
        ...state,
        status: "ready",
        errorCode: null,
        confirmed,
        pending,
        failed,
        nextOlderCursor: action.nextCursor,
        hasMoreOlder: action.nextCursor !== null,
      };
    }

    case "INIT_ERROR":
      return {
        ...state,
        status: "error",
        errorCode: action.errorCode,
      };

    case "LOAD_OLDER_START":
      return { ...state, isLoadingOlder: true };

    case "LOAD_OLDER_SUCCESS": {
      const confirmed = new Map(state.confirmed);
      for (const m of action.messages) {
        if (state.hidden.has(m.id)) continue;
        if (!confirmed.has(m.id)) confirmed.set(m.id, m);
      }
      return {
        ...state,
        confirmed,
        nextOlderCursor: action.nextCursor,
        hasMoreOlder: action.nextCursor !== null,
        isLoadingOlder: false,
      };
    }

    case "LOAD_OLDER_ERROR":
      return { ...state, isLoadingOlder: false };

    case "UPSERT_CONFIRMED": {
      const confirmed = new Map(state.confirmed);
      const pending = new Map(state.pending);
      const failed = new Set(state.failed);
      for (const m of action.messages) {
        if (state.hidden.has(m.id)) continue;
        confirmed.set(m.id, m);
        if (m.client_message_id) {
          pending.delete(m.client_message_id);
          failed.delete(m.client_message_id);
        }
      }
      return { ...state, confirmed, pending, failed, errorCode: null };
    }

    case "PATCH_CONFIRMED": {
      const confirmed = new Map(state.confirmed);
      const pending = new Map(state.pending);
      const failed = new Set(state.failed);
      let changed = false;
      for (const m of action.messages) {
        if (state.hidden.has(m.id)) continue;
        if (!confirmed.has(m.id)) continue;
        confirmed.set(m.id, m);
        changed = true;
        if (m.client_message_id) {
          pending.delete(m.client_message_id);
          failed.delete(m.client_message_id);
        }
      }
      if (!changed) return state;
      return { ...state, confirmed, pending, failed, errorCode: null };
    }

    case "ADD_PENDING": {
      const pending = new Map(state.pending);
      const failed = new Set(state.failed);
      const cid = action.message.client_message_id;
      if (cid) {
        pending.set(cid, action.message);
        failed.delete(cid);
      }
      return { ...state, pending, failed };
    }

    case "CONFIRM_PENDING": {
      const confirmed = new Map(state.confirmed);
      const pending = new Map(state.pending);
      const failed = new Set(state.failed);
      confirmed.set(action.message.id, action.message);
      pending.delete(action.clientMessageId);
      failed.delete(action.clientMessageId);
      return { ...state, confirmed, pending, failed };
    }

    case "FAIL_PENDING": {
      const failed = new Set(state.failed);
      failed.add(action.clientMessageId);
      return { ...state, failed };
    }

    case "CLEAR_FAILED": {
      const failed = new Set(state.failed);
      failed.delete(action.clientMessageId);
      return { ...state, failed };
    }

    case "LOCK_SEND_TERMINAL": {
      const pending = new Map(state.pending);
      const failed = new Set(state.failed);
      if (action.clientMessageId) {
        pending.delete(action.clientMessageId);
        failed.delete(action.clientMessageId);
      }
      return {
        ...state,
        pending,
        failed,
        sendLockReason: "terminal",
        errorCode: "TRIP_TERMINAL",
      };
    }

    case "SEND_START":
      return { ...state, isSending: true };

    case "SEND_END":
      return { ...state, isSending: false };

    case "KICKED":
      return { ...state, status: "kicked" };

    case "WS_ERROR":
      // Surface the latest error code without tearing the room down — the WS
      // layer keeps the socket; the room may be transiently unreachable.
      return { ...state, errorCode: action.errorCode };

    case "CLEAR_ROOM_ERROR":
      return { ...state, errorCode: null };

    case "UPDATE_REACTIONS": {
      const existing = state.confirmed.get(action.messageId);
      if (!existing) return state;
      const confirmed = new Map(state.confirmed);
      confirmed.set(action.messageId, { ...existing, reactions: action.reactions });
      return { ...state, confirmed, errorCode: null };
    }

    case "HIDE_MESSAGES": {
      const confirmed = new Map(state.confirmed);
      const pending = new Map(state.pending);
      const hidden = new Set(state.hidden);
      for (const messageId of action.messageIds) {
        hidden.add(messageId);
        confirmed.delete(messageId);
        pending.delete(messageId);
      }
      return { ...state, confirmed, pending, hidden, errorCode: null };
    }

    case "AI_TYPING_STARTED":
      return {
        ...state,
        activeAIInteractionId: action.interactionId,
        aiTypingRequestedByUserId: action.requestedByUserId,
      };

    case "AI_TYPING_STOPPED":
      if (state.activeAIInteractionId !== action.interactionId) return state;
      return { ...state, activeAIInteractionId: null, aiTypingRequestedByUserId: null };

    case "DROP_PENDING": {
      const pending = new Map(state.pending);
      const failed = new Set(state.failed);
      pending.delete(action.clientMessageId);
      failed.delete(action.clientMessageId);
      return { ...state, pending, failed };
    }

    default:
      return state;
  }
}

function compareMessages(a: ChatMessage, b: ChatMessage): number {
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function selectVisibleMessages(state: ChatState): ChatMessage[] {
  const all: ChatMessage[] = [];
  for (const m of state.confirmed.values()) {
    if (!state.hidden.has(m.id)) all.push(m);
  }
  for (const m of state.pending.values()) {
    if (state.hidden.has(m.id)) continue;
    // Hide pending whose confirmed twin has already arrived.
    const cid = m.client_message_id;
    if (cid) {
      let confirmedTwinExists = false;
      for (const c of state.confirmed.values()) {
        if (c.client_message_id === cid) {
          confirmedTwinExists = true;
          break;
        }
      }
      if (confirmedTwinExists) continue;
    }
    all.push(m);
  }
  all.sort(compareMessages);
  return all;
}

function makeOptimisticId(clientMessageId: string): string {
  return `optimistic:${clientMessageId}`;
}

function generateUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (RFC4122-ish) — only used in environments without WebCrypto.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function extractErrorCode(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = (error as AxiosError).response?.data;
    if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      typeof (data as { error_code?: unknown }).error_code === "string"
    ) {
      return (data as { error_code: string }).error_code;
    }
    const status = error.response?.status;
    if (status === 404) return "TRIP_NOT_FOUND";
    if (status === 409) return "TRIP_TERMINAL";
    if (status === 429) return "THROTTLED";
    if (status === 400) return "BAD_REQUEST";
  }
  return fallback;
}

function isRoomAccessLostError(errorCode: string): boolean {
  return ROOM_ACCESS_LOST_ERROR_CODES.has(errorCode);
}

function dispatchRecoverableOrAccessLostError(
  dispatch: React.Dispatch<ChatAction>,
  errorCode: string,
): void {
  if (errorCode === "TRIP_TERMINAL") {
    dispatch({ type: "LOCK_SEND_TERMINAL" });
    return;
  }
  if (isRoomAccessLostError(errorCode)) {
    dispatch({ type: "KICKED" });
    return;
  }
  dispatch({ type: "WS_ERROR", errorCode });
}

export function useTripChat(
  tripId: string,
  currentUser: { id: string; display_name: string; identify_tag: string | null },
): UseTripChatResult {
  const [state, dispatch] = useReducer(chatReducer, undefined, initialState);

  // Refs that need to survive rerenders without re-binding effects.
  const stateRef = useRef(state);
  stateRef.current = state;
  const tripIdRef = useRef(tripId);
  tripIdRef.current = tripId;
  const subscriptionAckedRef = useRef(false);
  const pendingPostSubscribeGapFillRef = useRef(false);
  const gapFillInFlightRef = useRef(false);
  const reactionInFlightRef = useRef<Set<string>>(new Set());

  const triggerPostSubscribeGapFill = useCallback(() => {
    if (!subscriptionAckedRef.current) return;
    if (!pendingPostSubscribeGapFillRef.current) return;
    if (gapFillInFlightRef.current) return;
    if (stateRef.current.status !== "ready") return;

    const updatedSince = getLatestUpdatedCursor(stateRef.current);
    pendingPostSubscribeGapFillRef.current = false;
    gapFillInFlightRef.current = true;
    void runPostSubscribeCatchUp(
      tripIdRef.current,
      stateRef,
      dispatch,
      updatedSince,
    ).finally(() => {
      gapFillInFlightRef.current = false;
    });
  }, []);

  // -------- Initial load --------
  useEffect(() => {
    let cancelled = false;
    const freshState = initialState();
    stateRef.current = freshState;
    subscriptionAckedRef.current = false;
    pendingPostSubscribeGapFillRef.current = false;
    gapFillInFlightRef.current = false;
    reactionInFlightRef.current.clear();
    dispatch({ type: "INIT_START" });

    bffListChatHistory(tripId, { limit: HISTORY_PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        // Backend returns descending; reducer just stores by id. UI sorts asc.
        dispatch({
          type: "INIT_SUCCESS",
          messages: res.results,
          nextCursor: res.next_cursor,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        dispatch({
          type: "INIT_ERROR",
          errorCode: extractErrorCode(error, "INIT_FAILED"),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  useEffect(() => {
    triggerPostSubscribeGapFill();
  }, [state.status, triggerPostSubscribeGapFill]);

  // -------- WebSocket room subscription --------
  useEffect(() => {
    const handle = joinChatRoom(tripId, {
      onMessage: (event: WsChatMessagePush) => {
        dispatch({ type: "UPSERT_CONFIRMED", messages: [event.message] });
      },
      onMessageDeleted: (event: WsChatMessageDeleted) => {
        dispatch({ type: "PATCH_CONFIRMED", messages: [event.message] });
      },
      onKicked: () => {
        dispatch({ type: "KICKED" });
      },
      onSubscribed: () => {
        subscriptionAckedRef.current = true;
        pendingPostSubscribeGapFillRef.current = true;
        dispatch({ type: "CLEAR_ROOM_ERROR" });
        triggerPostSubscribeGapFill();
      },
      onError: (event: WsChatError) => {
        dispatchRecoverableOrAccessLostError(dispatch, event.error_code);
      },
      onReactionUpdate: (event: WsChatReactionUpdate) => {
        dispatch({
          type: "UPDATE_REACTIONS",
          messageId: event.message_id,
          reactions: event.reactions,
        });
      },
      onAITypingStarted: (event: WsChatAITypingStarted) => {
        dispatch({
          type: "AI_TYPING_STARTED",
          interactionId: event.interaction_id,
          requestedByUserId: event.requested_by_user_id,
        });
      },
      onAITypingStopped: (event: WsChatAITypingStopped) => {
        dispatch({
          type: "AI_TYPING_STOPPED",
          interactionId: event.interaction_id,
        });
      },
    });

    return () => {
      handle.leave();
    };
  }, [tripId, triggerPostSubscribeGapFill]);

  // -------- Public actions --------
  const loadOlder = useCallback(async () => {
    const current = stateRef.current;
    if (
      !current.hasMoreOlder ||
      current.isLoadingOlder ||
      !current.nextOlderCursor
    ) {
      return;
    }
    dispatch({ type: "LOAD_OLDER_START" });
    try {
      const res = await bffListChatHistory(tripId, {
        cursor: current.nextOlderCursor,
        limit: HISTORY_PAGE_SIZE,
      });
      dispatch({
        type: "LOAD_OLDER_SUCCESS",
        messages: res.results,
        nextCursor: res.next_cursor,
      });
    } catch (error) {
      const errorCode = extractErrorCode(error, "LOAD_OLDER_FAILED");
      if (isRoomAccessLostError(errorCode)) {
        dispatch({ type: "KICKED" });
      } else {
        dispatch({ type: "LOAD_OLDER_ERROR" });
      }
    }
  }, [tripId]);

  const performSend = useCallback(
    async (
      content: string,
      clientMessageId: string,
      isRetry: boolean,
    ): Promise<SendOutcome> => {
      if (stateRef.current.sendLockReason === "terminal") {
        return "failed";
      }

      if (!isRetry) {
        const now = new Date().toISOString();
        const optimistic: ChatMessage = {
          id: makeOptimisticId(clientMessageId),
          trip_id: tripId,
          sender: {
            id: currentUser.id,
            display_name: currentUser.display_name,
            identify_tag: currentUser.identify_tag,
          },
          sender_kind: "USER",
          ai_status: null,
          content,
          client_message_id: clientMessageId,
          created_at: now,
          updated_at: now,
          is_deleted_for_everyone: false,
          deleted_for_everyone_at: null,
          deleted_for_everyone_by_id: null,
          delete_for_everyone_until: null,
          can_delete_for_everyone: false,
          reactions: [],
        };
        dispatch({ type: "ADD_PENDING", message: optimistic });
      } else {
        dispatch({ type: "CLEAR_FAILED", clientMessageId });
      }

      dispatch({ type: "SEND_START" });
      try {
        const result = await bffSendChatMessage(tripId, {
          content,
          client_message_id: clientMessageId,
        });
        dispatch({
          type: "CONFIRM_PENDING",
          clientMessageId,
          message: result.message,
        });
        return result.status === 200 ? "duplicate" : "ok";
      } catch (error) {
        const errorCode = extractErrorCode(error, "SEND_FAILED");
        if (errorCode === "TRIP_TERMINAL") {
          dispatch({ type: "LOCK_SEND_TERMINAL", clientMessageId });
          return "failed";
        }
        if (errorCode === "AI_BUSY" || errorCode === "INVALID_AI_PROMPT") {
          dispatch({ type: "DROP_PENDING", clientMessageId });
          dispatch({ type: "WS_ERROR", errorCode });
          return "failed";
        }
        dispatch({ type: "FAIL_PENDING", clientMessageId });
        // Surface a coarse error code on the room, or close it if access is gone.
        dispatchRecoverableOrAccessLostError(dispatch, errorCode);
        return "failed";
      } finally {
        dispatch({ type: "SEND_END" });
      }
    },
    [tripId, currentUser.id, currentUser.display_name, currentUser.identify_tag],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (trimmed.length === 0) return "failed" as const;
      return performSend(trimmed, generateUuid(), false);
    },
    [performSend],
  );

  const retryPending = useCallback(
    async (clientMessageId: string) => {
      const optimistic = stateRef.current.pending.get(clientMessageId);
      if (!optimistic) return "failed" as const;
      return performSend(optimistic.content, clientMessageId, true);
    },
    [performSend],
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (reactionInFlightRef.current.has(messageId)) return;
      const message = stateRef.current.confirmed.get(messageId);
      if (!message) return;
      reactionInFlightRef.current.add(messageId);

      // Each user has at most one reaction per message. Find their current one.
      // If they clicked the same emoji → toggle it off. Otherwise → add/replace.
      const currentReaction = message.reactions.find((r) =>
        r.reacted_by_ids.includes(currentUser.id),
      );
      const isSameEmoji = currentReaction?.emoji === emoji;

      try {
        const reactions = isSameEmoji
          ? await bffRemoveReaction(tripId, messageId, emoji)
          : await bffAddReaction(tripId, messageId, emoji);
        dispatch({ type: "UPDATE_REACTIONS", messageId, reactions });
      } catch (error) {
        const errorCode = extractErrorCode(error, "REACTION_FAILED");
        dispatchRecoverableOrAccessLostError(dispatch, errorCode);
      } finally {
        reactionInFlightRef.current.delete(messageId);
      }
    },
    [tripId, currentUser.id],
  );

  const deleteMessage = useCallback(
    async (messageId: string, mode: DeleteChatMessageMode) => {
      try {
        const result = await bffDeleteChatMessage(tripId, messageId, mode);
        if ("hidden_message_ids" in result) {
          dispatch({ type: "HIDE_MESSAGES", messageIds: result.hidden_message_ids });
          return;
        }
        dispatch({ type: "UPSERT_CONFIRMED", messages: [result.message] });
      } catch (error) {
        const errorCode = extractErrorCode(error, "DELETE_FAILED");
        dispatchRecoverableOrAccessLostError(dispatch, errorCode);
      }
    },
    [tripId],
  );

  const hideMessagesForMe = useCallback(
    async (messageIds: string[]) => {
      if (messageIds.length === 0) return;
      try {
        const result = await bffHideChatMessagesForMe(tripId, messageIds);
        dispatch({ type: "HIDE_MESSAGES", messageIds: result.hidden_message_ids });
      } catch (error) {
        const errorCode = extractErrorCode(error, "DELETE_FAILED");
        dispatchRecoverableOrAccessLostError(dispatch, errorCode);
      }
    },
    [tripId],
  );

  return {
    status: state.status,
    errorCode: state.errorCode,
    messages: selectVisibleMessages(state),
    pendingClientIds: new Set(state.pending.keys()),
    failedClientIds: new Set(state.failed),
    sendLockReason: state.sendLockReason,
    hasMoreOlder: state.hasMoreOlder,
    isLoadingOlder: state.isLoadingOlder,
    isSending: state.isSending,
    isAITyping: state.activeAIInteractionId !== null,
    loadOlder,
    sendMessage,
    retryPending,
    toggleReaction,
    deleteMessage,
    hideMessagesForMe,
  };
}

// -------- Internal helpers --------

function getLatestUpdatedCursor(state: ChatState): UpdatedSyncCursor | null {
  let latest: UpdatedSyncCursor | null = null;
  for (const m of state.confirmed.values()) {
    const candidate = m.updated_at || m.created_at;
    if (
      latest === null ||
      candidate > latest.updatedAt ||
      (candidate === latest.updatedAt && m.id > latest.id)
    ) {
      latest = { updatedAt: candidate, id: m.id };
    }
  }
  return latest;
}

async function runPostSubscribeCatchUp(
  tripId: string,
  stateRef: { current: ChatState },
  dispatch: React.Dispatch<ChatAction>,
  updatedSince: UpdatedSyncCursor | null,
): Promise<void> {
  await runGapFill(tripId, stateRef, dispatch);
  if (updatedSince !== null) {
    await runUpdatedSync(tripId, updatedSince.updatedAt, updatedSince.id, dispatch);
  }
}

async function runGapFill(
  tripId: string,
  stateRef: { current: ChatState },
  dispatch: React.Dispatch<ChatAction>,
): Promise<void> {
  // Find the newest confirmed message id as the lower bound.
  let latest: ChatMessage | null = null;
  for (const m of stateRef.current.confirmed.values()) {
    if (latest === null || compareMessages(m, latest) > 0) latest = m;
  }
  if (!latest) {
    try {
      const res = await bffListChatHistory(tripId, { limit: HISTORY_PAGE_SIZE });
      dispatch({
        type: "INIT_SUCCESS",
        messages: res.results,
        nextCursor: res.next_cursor,
      });
    } catch (error) {
      const errorCode = extractErrorCode(error, "GAP_FILL_FAILED");
      if (isRoomAccessLostError(errorCode)) {
        dispatch({ type: "KICKED" });
      }
    }
    return;
  }

  let since = latest.id;
  for (let page = 0; page < GAP_FILL_MAX_PAGES; page += 1) {
    let res;
    try {
      res = await bffGapFillChatMessages(tripId, {
        since,
        limit: GAP_FILL_PAGE_SIZE,
      });
    } catch (error) {
      const errorCode = extractErrorCode(error, "GAP_FILL_FAILED");
      if (isRoomAccessLostError(errorCode)) {
        dispatch({ type: "KICKED" });
      }
      return;
    }
    if (res.results.length === 0) return;
    dispatch({ type: "UPSERT_CONFIRMED", messages: res.results });
    if (!res.has_more) return;
    since = res.results[res.results.length - 1].id;
  }
  dispatch({ type: "WS_ERROR", errorCode: "GAP_FILL_INCOMPLETE" });
}

async function runUpdatedSync(
  tripId: string,
  updatedSince: string,
  initialUpdatedSinceId: string | undefined,
  dispatch: React.Dispatch<ChatAction>,
): Promise<void> {
  let updatedSinceCursor = updatedSince;
  let updatedSinceId = initialUpdatedSinceId;
  for (let page = 0; page < GAP_FILL_MAX_PAGES; page += 1) {
    let res;
    try {
      const options = {
        updated_since: updatedSinceCursor,
        limit: GAP_FILL_PAGE_SIZE,
        ...(updatedSinceId ? { updated_since_id: updatedSinceId } : {}),
      };
      res = await bffSyncUpdatedChatMessages(tripId, options);
    } catch (error) {
      const errorCode = extractErrorCode(error, "UPDATE_SYNC_FAILED");
      if (isRoomAccessLostError(errorCode)) {
        dispatch({ type: "KICKED" });
      }
      return;
    }
    if (res.results.length === 0) return;
    dispatch({ type: "PATCH_CONFIRMED", messages: res.results });
    if (!res.has_more) return;
    const last = res.results[res.results.length - 1];
    updatedSinceCursor = last.updated_at;
    updatedSinceId = last.id;
  }
  dispatch({ type: "WS_ERROR", errorCode: "UPDATE_SYNC_INCOMPLETE" });
}
