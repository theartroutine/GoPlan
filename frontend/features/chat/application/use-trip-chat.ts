"use client";

import axios from "axios";
import { useCallback, useEffect, useReducer, useRef } from "react";

import type { AxiosError } from "axios";

import {
  bffGapFillChatMessages,
  bffListChatHistory,
  bffSendChatMessage,
} from "@/features/chat/infrastructure/chat-api";
import { joinChatRoom } from "@/features/chat/infrastructure/chat-ws-bridge";
import { useWebSocket } from "@/features/realtime/application/ws-context";

import type {
  ChatMessage,
  WsChatError,
  WsChatMessagePush,
} from "@/features/chat/domain/types";

const HISTORY_PAGE_SIZE = 30;
const GAP_FILL_PAGE_SIZE = 100;
const GAP_FILL_MAX_PAGES = 50; // hard upper bound to avoid infinite loops
const ROOM_ACCESS_LOST_ERROR_CODES = new Set(["TRIP_NOT_FOUND", "FORBIDDEN"]);

export type ChatRoomStatus = "loading" | "ready" | "error" | "kicked";

type SendOutcome = "ok" | "duplicate" | "failed";

export type UseTripChatResult = {
  status: ChatRoomStatus;
  errorCode: string | null;
  /** Messages in ascending order by (created_at, id). Includes optimistic. */
  messages: ChatMessage[];
  /** Set of client_message_ids that haven't been confirmed by server yet. */
  pendingClientIds: Set<string>;
  /** Set of client_message_ids whose POST resolved with an error. */
  failedClientIds: Set<string>;
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  isSending: boolean;
  loadOlder: () => Promise<void>;
  sendMessage: (content: string) => Promise<SendOutcome>;
  retryPending: (clientMessageId: string) => Promise<SendOutcome>;
};

type ChatState = {
  status: ChatRoomStatus;
  errorCode: string | null;
  /** id → message, source of truth for confirmed (server-acknowledged) messages. */
  confirmed: Map<string, ChatMessage>;
  /** client_message_id → optimistic ChatMessage, replaced once confirmed. */
  pending: Map<string, ChatMessage>;
  failed: Set<string>;
  hasMoreOlder: boolean;
  nextOlderCursor: string | null;
  isLoadingOlder: boolean;
  isSending: boolean;
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
  | { type: "ADD_PENDING"; message: ChatMessage }
  | { type: "CONFIRM_PENDING"; clientMessageId: string; message: ChatMessage }
  | { type: "FAIL_PENDING"; clientMessageId: string }
  | { type: "CLEAR_FAILED"; clientMessageId: string }
  | { type: "SEND_START" }
  | { type: "SEND_END" }
  | { type: "KICKED" }
  | { type: "WS_ERROR"; errorCode: string };

function initialState(): ChatState {
  return {
    status: "loading",
    errorCode: null,
    confirmed: new Map(),
    pending: new Map(),
    failed: new Set(),
    hasMoreOlder: false,
    nextOlderCursor: null,
    isLoadingOlder: false,
    isSending: false,
  };
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "INIT_START":
      return { ...initialState() };

    case "INIT_SUCCESS": {
      const confirmed = new Map<string, ChatMessage>();
      for (const m of action.messages) confirmed.set(m.id, m);
      return {
        ...state,
        status: "ready",
        errorCode: null,
        confirmed,
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
        confirmed.set(m.id, m);
        if (m.client_message_id) {
          pending.delete(m.client_message_id);
          failed.delete(m.client_message_id);
        }
      }
      return { ...state, confirmed, pending, failed };
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
  for (const m of state.confirmed.values()) all.push(m);
  for (const m of state.pending.values()) {
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
    if (status === 400) return "INVALID_CONTENT";
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
  const { status: wsStatus } = useWebSocket();

  // Refs that need to survive rerenders without re-binding effects.
  const stateRef = useRef(state);
  stateRef.current = state;
  const tripIdRef = useRef(tripId);
  tripIdRef.current = tripId;
  const lastWsStatusRef = useRef(wsStatus);

  // -------- Initial load --------
  useEffect(() => {
    let cancelled = false;
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

  // -------- WebSocket room subscription --------
  useEffect(() => {
    const handle = joinChatRoom(tripId, {
      onMessage: (event: WsChatMessagePush) => {
        dispatch({ type: "UPSERT_CONFIRMED", messages: [event.message] });
      },
      onKicked: () => {
        dispatch({ type: "KICKED" });
      },
      onError: (event: WsChatError) => {
        dispatchRecoverableOrAccessLostError(dispatch, event.error_code);
      },
    });

    return () => {
      handle.leave();
    };
  }, [tripId]);

  // -------- Reconnect gap-fill --------
  useEffect(() => {
    const previous = lastWsStatusRef.current;
    lastWsStatusRef.current = wsStatus;

    if (wsStatus !== "connected" || previous === "connected") return;
    if (stateRef.current.status === "loading") return; // initial load handles it
    if (stateRef.current.status === "kicked") return;

    void runGapFill(tripIdRef.current, stateRef, dispatch);
  }, [wsStatus]);

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
      if (!isRetry) {
        const optimistic: ChatMessage = {
          id: makeOptimisticId(clientMessageId),
          trip_id: tripId,
          sender: {
            id: currentUser.id,
            display_name: currentUser.display_name,
            identify_tag: currentUser.identify_tag,
          },
          content,
          client_message_id: clientMessageId,
          created_at: new Date().toISOString(),
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

  return {
    status: state.status,
    errorCode: state.errorCode,
    messages: selectVisibleMessages(state),
    pendingClientIds: new Set(state.pending.keys()),
    failedClientIds: new Set(state.failed),
    hasMoreOlder: state.hasMoreOlder,
    isLoadingOlder: state.isLoadingOlder,
    isSending: state.isSending,
    loadOlder,
    sendMessage,
    retryPending,
  };
}

// -------- Internal helpers --------

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
  if (!latest) return;

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
}
