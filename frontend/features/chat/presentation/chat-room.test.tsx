import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatRoom } from "@/features/chat/presentation/chat-room";

const chatMock = vi.hoisted(() => ({
  state: {
    status: "ready" as const,
    errorCode: null,
    messages: [],
    pendingClientIds: new Set<string>(),
    failedClientIds: new Set<string>(),
    hasMoreOlder: false,
    isLoadingOlder: false,
    isSending: false,
    loadOlder: vi.fn(),
    sendMessage: vi.fn(),
    retryPending: vi.fn(),
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
});
