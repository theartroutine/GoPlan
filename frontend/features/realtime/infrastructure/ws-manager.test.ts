import { describe, expect, it, vi } from "vitest";

import type { WsMessage } from "@/features/realtime/domain/types";
import { WebSocketManager } from "@/features/realtime/infrastructure/ws-manager";

type TestableWebSocketManager = WebSocketManager & {
  emit: (type: string, data: WsMessage) => void;
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
});
