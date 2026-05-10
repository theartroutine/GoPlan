import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/features/chat/domain/types";

const chatApiMock = vi.hoisted(() => ({
  bffListChatHistory: vi.fn(),
  bffGapFillChatMessages: vi.fn(),
  bffSendChatMessage: vi.fn(),
  bffDeleteChatMessage: vi.fn(),
  bffHideChatMessagesForMe: vi.fn(),
}));

const wsBridgeMock = vi.hoisted(() => {
  const handle = { leave: vi.fn() };
  const listenersRef: { current: Parameters<typeof handle.leave> | null } = {
    current: null,
  };
  return {
    handle,
    listenersRef,
    joinChatRoom: vi.fn(
      (
        _tripId: string,
        listeners: {
          onMessage?: (e: unknown) => void;
          onKicked?: (e: unknown) => void;
          onError?: (e: unknown) => void;
          onSubscribed?: (e: unknown) => void;
          onMessageDeleted?: (e: unknown) => void;
        },
      ) => {
        listenersRef.current = listeners as never;
        return handle;
      },
    ),
  };
});

vi.mock("@/features/chat/infrastructure/chat-api", () => chatApiMock);
vi.mock("@/features/chat/infrastructure/chat-ws-bridge", () => ({
  joinChatRoom: wsBridgeMock.joinChatRoom,
}));

import { useTripChat } from "@/features/chat/application/use-trip-chat";

const TRIP_ID = "trip-1";
const ME = {
  id: "user-self",
  display_name: "Me",
  identify_tag: null,
};

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m-1",
    trip_id: TRIP_ID,
    sender: { id: "user-other", display_name: "Other", identify_tag: null },
    content: "hello",
    client_message_id: null,
    created_at: "2026-05-08T10:00:00Z",
    is_deleted_for_everyone: false,
    deleted_for_everyone_at: null,
    deleted_for_everyone_by_id: null,
    reactions: [],
    ...overrides,
  };
}

describe("useTripChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatApiMock.bffListChatHistory.mockReset();
    chatApiMock.bffGapFillChatMessages.mockReset();
    chatApiMock.bffSendChatMessage.mockReset();
    chatApiMock.bffDeleteChatMessage.mockReset();
    chatApiMock.bffHideChatMessagesForMe.mockReset();
    wsBridgeMock.listenersRef.current = null;
  });

  it("loads initial history and exposes ascending messages", async () => {
    chatApiMock.bffListChatHistory.mockResolvedValue({
      // backend returns descending; the hook sorts ascending for the UI
      results: [
        makeMessage({ id: "m-2", created_at: "2026-05-08T10:01:00Z" }),
        makeMessage({ id: "m-1", created_at: "2026-05-08T10:00:00Z" }),
      ],
      next_cursor: null,
    });

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.messages.map((m) => m.id)).toEqual(["m-1", "m-2"]);
    expect(result.current.hasMoreOlder).toBe(false);
  });

  it("keeps websocket messages that arrive before initial history resolves", async () => {
    let resolveHistory:
      | ((value: { results: ChatMessage[]; next_cursor: string | null }) => void)
      | null = null;
    chatApiMock.bffListChatHistory.mockReturnValue(
      new Promise((resolve) => {
        resolveHistory = resolve;
      }),
    );

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));

    await waitFor(() => {
      expect(wsBridgeMock.listenersRef.current).not.toBeNull();
    });

    act(() => {
      const listeners = wsBridgeMock.listenersRef.current as unknown as {
        onMessage: (e: unknown) => void;
      };
      listeners.onMessage({
        type: "chat.message",
        trip_id: TRIP_ID,
        message: makeMessage({
          id: "ws-first",
          content: "arrived over ws",
          created_at: "2026-05-08T10:02:00Z",
        }),
      });
    });

    act(() => {
      resolveHistory?.({
        results: [
          makeMessage({
            id: "history-old",
            content: "history",
            created_at: "2026-05-08T10:00:00Z",
          }),
        ],
        next_cursor: null,
      });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(result.current.messages.map((m) => m.id)).toEqual([
      "history-old",
      "ws-first",
    ]);
  });

  it("gap-fills after subscribe ack to close the initial history race", async () => {
    chatApiMock.bffListChatHistory.mockResolvedValue({
      results: [
        makeMessage({
          id: "history-latest",
          created_at: "2026-05-08T10:00:00Z",
        }),
      ],
      next_cursor: null,
    });
    chatApiMock.bffGapFillChatMessages.mockResolvedValueOnce({
      results: [
        makeMessage({
          id: "missed-between-history-and-subscribe",
          content: "missed window",
          created_at: "2026-05-08T10:01:00Z",
        }),
      ],
      has_more: false,
    });

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      const listeners = wsBridgeMock.listenersRef.current as unknown as {
        onSubscribed: (e: unknown) => void;
      };
      listeners.onSubscribed({ type: "chat.subscribed", trip_id: TRIP_ID });
    });

    await waitFor(() => {
      expect(chatApiMock.bffGapFillChatMessages).toHaveBeenCalledWith(
        TRIP_ID,
        { since: "history-latest", limit: 100 },
      );
    });
    await waitFor(() => {
      expect(result.current.messages.map((m) => m.id)).toEqual([
        "history-latest",
        "missed-between-history-and-subscribe",
      ]);
    });
  });

  it("loads latest history on subscribe ack when there is no gap-fill anchor yet", async () => {
    chatApiMock.bffListChatHistory
      .mockResolvedValueOnce({
        results: [],
        next_cursor: null,
      })
      .mockResolvedValueOnce({
        results: [
          makeMessage({
            id: "first-after-subscribe",
            content: "first missed message",
            created_at: "2026-05-08T10:03:00Z",
          }),
        ],
        next_cursor: null,
      });

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      const listeners = wsBridgeMock.listenersRef.current as unknown as {
        onSubscribed: (e: unknown) => void;
      };
      listeners.onSubscribed({ type: "chat.subscribed", trip_id: TRIP_ID });
    });

    await waitFor(() => {
      expect(chatApiMock.bffListChatHistory).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current.messages.map((m) => m.id)).toEqual([
        "first-after-subscribe",
      ]);
    });
  });

  it("surfaces an error when reconnect gap-fill reaches its safety cap", async () => {
    chatApiMock.bffListChatHistory.mockResolvedValue({
      results: [
        makeMessage({
          id: "history-latest",
          created_at: "2026-05-08T10:00:00Z",
        }),
      ],
      next_cursor: null,
    });
    chatApiMock.bffGapFillChatMessages.mockImplementation(async () => {
      const callNumber = chatApiMock.bffGapFillChatMessages.mock.calls.length;
      return {
        results: [
          makeMessage({
            id: `gap-${callNumber}`,
            created_at: `2026-05-08T10:${String(callNumber + 1).padStart(2, "0")}:00Z`,
          }),
        ],
        has_more: true,
      };
    });

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      const listeners = wsBridgeMock.listenersRef.current as unknown as {
        onSubscribed: (e: unknown) => void;
      };
      listeners.onSubscribed({ type: "chat.subscribed", trip_id: TRIP_ID });
    });

    await waitFor(() => {
      expect(result.current.errorCode).toBe("GAP_FILL_INCOMPLETE");
    });
    expect(chatApiMock.bffGapFillChatMessages).toHaveBeenCalledTimes(50);
  });

  it("does not label generic HTTP 400 history errors as invalid message content", async () => {
    chatApiMock.bffListChatHistory.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { detail: "Bad query." },
      },
    });

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.errorCode).toBe("BAD_REQUEST");
  });

  it("optimistically renders sent message, then confirms with server message", async () => {
    chatApiMock.bffListChatHistory.mockResolvedValue({
      results: [],
      next_cursor: null,
    });
    chatApiMock.bffSendChatMessage.mockImplementation(
      async (_tripId, input) => ({
        message: makeMessage({
          id: "server-id",
          sender: { ...ME },
          content: input.content,
          client_message_id: input.client_message_id,
          created_at: "2026-05-08T10:05:00Z",
        }),
        status: 201 as const,
      }),
    );

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    let outcome: string = "";
    await act(async () => {
      outcome = await result.current.sendMessage("hi there");
    });

    expect(outcome).toBe("ok");
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].id).toBe("server-id");
    expect(result.current.pendingClientIds.size).toBe(0);
  });

  it("dedupes when WS push and POST result share the same client_message_id", async () => {
    chatApiMock.bffListChatHistory.mockResolvedValue({
      results: [],
      next_cursor: null,
    });

    let capturedClientId: string | null = null;
    chatApiMock.bffSendChatMessage.mockImplementation(async (_t, input) => {
      capturedClientId = input.client_message_id;
      return {
        message: makeMessage({
          id: "server-id",
          sender: { ...ME },
          content: input.content,
          client_message_id: input.client_message_id,
          created_at: "2026-05-08T10:05:00Z",
        }),
        status: 201 as const,
      };
    });

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    // Kick off send but immediately deliver the WS push first.
    let sendPromise: Promise<unknown> | null = null;
    act(() => {
      sendPromise = result.current.sendMessage("yo");
    });

    // Wait until POST has been called so we know the clientMessageId
    await waitFor(() => {
      expect(capturedClientId).not.toBeNull();
    });

    act(() => {
      const listeners = wsBridgeMock.listenersRef.current as unknown as {
        onMessage: (e: unknown) => void;
      };
      listeners.onMessage({
        type: "chat.message",
        trip_id: TRIP_ID,
        message: makeMessage({
          id: "server-id",
          sender: { ...ME },
          content: "yo",
          client_message_id: capturedClientId,
          created_at: "2026-05-08T10:05:00Z",
        }),
      });
    });

    await act(async () => {
      await sendPromise;
    });

    // Exactly one bubble for that message — no duplicate.
    const matching = result.current.messages.filter((m) => m.id === "server-id");
    expect(matching).toHaveLength(1);
    expect(result.current.pendingClientIds.size).toBe(0);
  });

  it("transitions to kicked state on kicked push", async () => {
    chatApiMock.bffListChatHistory.mockResolvedValue({
      results: [],
      next_cursor: null,
    });

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      const listeners = wsBridgeMock.listenersRef.current as unknown as {
        onKicked: (e: unknown) => void;
      };
      listeners.onKicked({ type: "chat.kicked", trip_id: TRIP_ID });
    });

    expect(result.current.status).toBe("kicked");
  });

  it("treats room access errors as kicked after missed membership changes", async () => {
    chatApiMock.bffListChatHistory.mockResolvedValue({
      results: [],
      next_cursor: null,
    });

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      const listeners = wsBridgeMock.listenersRef.current as unknown as {
        onError: (e: unknown) => void;
      };
      listeners.onError({
        type: "chat.error",
        trip_id: TRIP_ID,
        error_code: "TRIP_NOT_FOUND",
        detail: "Trip not found.",
      });
    });

    expect(result.current.status).toBe("kicked");
  });

  it("moves to kicked when send discovers lost trip access", async () => {
    chatApiMock.bffListChatHistory.mockResolvedValue({
      results: [],
      next_cursor: null,
    });
    chatApiMock.bffSendChatMessage.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 404,
        data: { detail: "Trip not found.", error_code: "TRIP_NOT_FOUND" },
      },
    });

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    let outcome: string = "";
    await act(async () => {
      outcome = await result.current.sendMessage("still here?");
    });

    expect(outcome).toBe("failed");
    expect(result.current.status).toBe("kicked");
  });

  it("locks sending and removes the optimistic message when backend marks the trip terminal", async () => {
    chatApiMock.bffListChatHistory.mockResolvedValue({
      results: [],
      next_cursor: null,
    });
    chatApiMock.bffSendChatMessage.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: "Trip is read-only.", error_code: "TRIP_TERMINAL" },
      },
    });

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    let outcome: string = "";
    await act(async () => {
      outcome = await result.current.sendMessage("too late");
    });

    expect(outcome).toBe("failed");
    expect(result.current.sendLockReason).toBe("terminal");
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.failedClientIds.size).toBe(0);
  });

  it("marks failed sends so the UI can offer retry", async () => {
    chatApiMock.bffListChatHistory.mockResolvedValue({
      results: [],
      next_cursor: null,
    });

    chatApiMock.bffSendChatMessage.mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    let outcome: string = "";
    await act(async () => {
      outcome = await result.current.sendMessage("oops");
    });

    expect(outcome).toBe("failed");
    expect(result.current.failedClientIds.size).toBe(1);
  });

  it("hides a single message for the current user without deleting it globally", async () => {
    chatApiMock.bffListChatHistory.mockResolvedValue({
      results: [makeMessage({ id: "hide-me" })],
      next_cursor: null,
    });
    chatApiMock.bffDeleteChatMessage.mockResolvedValueOnce({
      hidden_message_ids: ["hide-me"],
    });

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    await act(async () => {
      await result.current.deleteMessage("hide-me", "for_me");
    });

    expect(chatApiMock.bffDeleteChatMessage).toHaveBeenCalledWith(
      TRIP_ID,
      "hide-me",
      "for_me",
    );
    expect(result.current.messages).toHaveLength(0);
  });

  it("applies message_deleted websocket tombstones", async () => {
    chatApiMock.bffListChatHistory.mockResolvedValue({
      results: [makeMessage({ id: "delete-everyone", content: "secret" })],
      next_cursor: null,
    });

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      const listeners = wsBridgeMock.listenersRef.current as unknown as {
        onMessageDeleted: (e: unknown) => void;
      };
      listeners.onMessageDeleted({
        type: "chat.message_deleted",
        trip_id: TRIP_ID,
        message: makeMessage({
          id: "delete-everyone",
          content: "",
          is_deleted_for_everyone: true,
          deleted_for_everyone_at: "2026-05-08T10:01:00Z",
          deleted_for_everyone_by_id: ME.id,
        }),
      });
    });

    expect(result.current.messages[0].is_deleted_for_everyone).toBe(true);
    expect(result.current.messages[0].content).toBe("");
  });

  it("does not resurrect a locally hidden message when a global delete event arrives later", async () => {
    chatApiMock.bffListChatHistory.mockResolvedValue({
      results: [makeMessage({ id: "hidden-before-global-delete" })],
      next_cursor: null,
    });
    chatApiMock.bffHideChatMessagesForMe.mockResolvedValueOnce({
      hidden_message_ids: ["hidden-before-global-delete"],
    });

    const { result } = renderHook(() => useTripChat(TRIP_ID, ME));
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    await act(async () => {
      await result.current.hideMessagesForMe(["hidden-before-global-delete"]);
    });

    act(() => {
      const listeners = wsBridgeMock.listenersRef.current as unknown as {
        onMessageDeleted: (e: unknown) => void;
      };
      listeners.onMessageDeleted({
        type: "chat.message_deleted",
        trip_id: TRIP_ID,
        message: makeMessage({
          id: "hidden-before-global-delete",
          content: "",
          is_deleted_for_everyone: true,
          deleted_for_everyone_at: "2026-05-08T10:02:00Z",
          deleted_for_everyone_by_id: ME.id,
        }),
      });
    });

    expect(result.current.messages).toHaveLength(0);
  });
});
