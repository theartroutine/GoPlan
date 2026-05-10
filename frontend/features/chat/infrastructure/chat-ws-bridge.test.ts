import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHAT_WS_MESSAGE_TYPES } from "@/features/realtime/domain/types";

import type {
  WsConnectionStatus,
  WsMessage,
} from "@/features/realtime/domain/types";

const wsManagerMock = vi.hoisted(() => {
  let status: WsConnectionStatus = "connected";
  const messageListeners = new Map<string, Set<(data: WsMessage) => void>>();
  const statusListeners = new Set<(nextStatus: WsConnectionStatus) => void>();
  const send = vi.fn(() => true);

  return {
    wsManager: {
      getStatus: () => status,
      send,
      on: (type: string, callback: (data: WsMessage) => void) => {
        const listeners = messageListeners.get(type) ?? new Set();
        listeners.add(callback);
        messageListeners.set(type, listeners);
        return () => {
          listeners.delete(callback);
        };
      },
      onStatusChange: (callback: (nextStatus: WsConnectionStatus) => void) => {
        statusListeners.add(callback);
        return () => {
          statusListeners.delete(callback);
        };
      },
    },
    reset: () => {
      status = "connected";
      send.mockClear();
      messageListeners.clear();
      statusListeners.clear();
    },
    emit: (type: string, data: WsMessage) => {
      for (const listener of messageListeners.get(type) ?? []) listener(data);
    },
    setStatus: (nextStatus: WsConnectionStatus) => {
      status = nextStatus;
      for (const listener of statusListeners) listener(nextStatus);
    },
    send,
  };
});

vi.mock("@/features/realtime/infrastructure/ws-manager", () => ({
  wsManager: wsManagerMock.wsManager,
}));

import {
  __resetChatBridgeForTests,
  joinChatRoom,
} from "@/features/chat/infrastructure/chat-ws-bridge";

describe("chat-ws-bridge", () => {
  beforeEach(() => {
    wsManagerMock.reset();
    __resetChatBridgeForTests();
  });

  it("removes kicked rooms so reconnect does not resubscribe them", () => {
    const onKicked = vi.fn();

    joinChatRoom("trip-1", { onKicked });

    expect(wsManagerMock.send).toHaveBeenCalledWith({
      type: CHAT_WS_MESSAGE_TYPES.SUBSCRIBE,
      trip_id: "trip-1",
    });
    wsManagerMock.send.mockClear();

    wsManagerMock.emit(CHAT_WS_MESSAGE_TYPES.KICKED, {
      type: CHAT_WS_MESSAGE_TYPES.KICKED,
      trip_id: "trip-1",
    });

    expect(onKicked).toHaveBeenCalledTimes(1);

    wsManagerMock.setStatus("disconnected");
    wsManagerMock.setStatus("connected");

    expect(wsManagerMock.send).not.toHaveBeenCalled();
  });

  it("routes message_deleted events to the subscribed room", () => {
    const onMessageDeleted = vi.fn();

    joinChatRoom("trip-1", { onMessageDeleted });

    wsManagerMock.emit(CHAT_WS_MESSAGE_TYPES.MESSAGE_DELETED, {
      type: CHAT_WS_MESSAGE_TYPES.MESSAGE_DELETED,
      trip_id: "trip-1",
      message: { id: "msg-1", is_deleted_for_everyone: true },
    });

    expect(onMessageDeleted).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CHAT_WS_MESSAGE_TYPES.MESSAGE_DELETED,
        trip_id: "trip-1",
      }),
    );
  });
});
