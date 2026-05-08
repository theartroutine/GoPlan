import { describe, expect, it, vi } from "vitest";

import type { WsMessage } from "@/features/realtime/domain/types";
import { WebSocketManager } from "@/features/realtime/infrastructure/ws-manager";

type TestableWebSocketManager = WebSocketManager & {
  emit: (type: string, data: WsMessage) => void;
};

type WebSocketManagerInternals = {
  ws: WebSocket | null;
  closeSocketForUnload: () => void;
};

describe("WebSocketManager", () => {
  it("keeps message listeners registered after disconnect", () => {
    const manager = new WebSocketManager();
    const testManager = manager as TestableWebSocketManager;
    const listener = vi.fn();
    const message: WsMessage = { type: "notification", event: "read_all" };

    const unsubscribe = manager.on("notification", listener);

    manager.disconnect();
    testManager.emit("notification", message);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(message);

    unsubscribe();
    testManager.emit("notification", message);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("uses a browser-allowed close code during page unload", () => {
    const manager = new WebSocketManager() as unknown as WebSocketManagerInternals;
    const close = vi.fn();

    manager.ws = {
      readyState: WebSocket.OPEN,
      close,
      onopen: vi.fn(),
      onmessage: vi.fn(),
      onclose: vi.fn(),
      onerror: vi.fn(),
    } as unknown as WebSocket;

    manager.closeSocketForUnload();

    expect(close).toHaveBeenCalledWith(1000, "Page unloading");
  });
});
