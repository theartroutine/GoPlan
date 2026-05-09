import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/features/chat/domain/types";

const chatApiMock = vi.hoisted(() => ({
  bffListChatHistory: vi.fn(),
  bffGapFillChatMessages: vi.fn(),
  bffSendChatMessage: vi.fn(),
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
        },
      ) => {
        listenersRef.current = listeners as never;
        return handle;
      },
    ),
  };
});

const wsContextMock = vi.hoisted(() => ({
  status: "connected" as
    | "connected"
    | "connecting"
    | "reconnecting"
    | "disconnected",
}));

vi.mock("@/features/chat/infrastructure/chat-api", () => chatApiMock);
vi.mock("@/features/chat/infrastructure/chat-ws-bridge", () => ({
  joinChatRoom: wsBridgeMock.joinChatRoom,
}));
vi.mock("@/features/realtime/application/ws-context", () => ({
  useWebSocket: () => ({ status: wsContextMock.status }),
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
    ...overrides,
  };
}

describe("useTripChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wsContextMock.status = "connected";
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
});
