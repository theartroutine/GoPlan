import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatRoom } from "@/features/chat/presentation/chat-room";

const chatMock = vi.hoisted(() => ({
  state: {
    status: "ready" as const,
    errorCode: null as string | null,
    messages: [],
    pendingClientIds: new Set<string>(),
    failedClientIds: new Set<string>(),
    sendLockReason: null as "terminal" | null,
    hasMoreOlder: false,
    isLoadingOlder: false,
    isSending: false,
    loadOlder: vi.fn(),
    sendMessage: vi.fn(),
    retryPending: vi.fn(),
    toggleReaction: vi.fn(),
    deleteMessage: vi.fn(),
    hideMessagesForMe: vi.fn(),
  },
}));

const wsContextMock = vi.hoisted(() => ({
  status: "connected" as
    | "connected"
    | "connecting"
    | "reconnecting"
    | "disconnected",
}));

vi.mock("@/features/chat/application/use-trip-chat", () => ({
  useTripChat: () => chatMock.state,
}));

vi.mock("@/features/realtime/application/ws-context", () => ({
  useWebSocket: () => ({ status: wsContextMock.status }),
}));

const CURRENT_USER = {
  id: "user-self",
  display_name: "Me",
  identify_tag: null,
};

describe("ChatRoom", () => {
  beforeEach(() => {
    wsContextMock.status = "connected";
    chatMock.state.status = "ready";
    chatMock.state.errorCode = null;
    chatMock.state.sendLockReason = null;
    chatMock.state.isSending = false;
  });

  it("keeps REST sending available while websocket is disconnected", () => {
    wsContextMock.status = "disconnected";

    render(
      <ChatRoom
        tripId="trip-1"
        isTerminal={false}
        currentUser={CURRENT_USER}
      />,
    );

    const textarea = screen.getByLabelText("Message") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
  });

  it("locks composer when the chat hook discovers a terminal trip", () => {
    chatMock.state.sendLockReason = "terminal";

    render(
      <ChatRoom
        tripId="trip-1"
        isTerminal={false}
        currentUser={CURRENT_USER}
      />,
    );

    expect(
      screen.getByText("This trip is closed — sending new messages is disabled."),
    ).toBeDefined();
    expect(screen.queryByLabelText("Message")).toBeNull();
  });

  it("surfaces realtime room errors while keeping the composer available", () => {
    chatMock.state.errorCode = "SERVER_ERROR";

    render(
      <ChatRoom
        tripId="trip-1"
        isTerminal={false}
        currentUser={CURRENT_USER}
      />,
    );

    expect(screen.getByText("Realtime updates are unavailable.")).toBeDefined();
    expect(screen.getByLabelText("Message")).toBeDefined();
  });
});
