import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WsMessage } from "@/features/realtime/domain/types";
import { bffWsTicket } from "@/features/realtime/infrastructure/realtime-api";
import {
  WebSocketManager,
  resolveWebSocketBaseUrl,
} from "@/features/realtime/infrastructure/ws-manager";

vi.mock("@/features/realtime/infrastructure/realtime-api", () => ({
  bffWsTicket: vi.fn(),
  bffRefreshWsTicket: vi.fn(),
}));

type WebSocketManagerEmitter = {
  emit: (type: string, data: WsMessage) => void;
};

type WebSocketManagerInternals = {
  ws: WebSocket | null;
  closeSocketForUnload: () => void;
};

describe("WebSocketManager", () => {
  it("upgrades non-local ws URLs on secure pages", () => {
    expect(resolveWebSocketBaseUrl("ws://api.example.com", "https:")).toBe(
      "wss://api.example.com",
    );
  });

  it("allows local ws URLs for development", () => {
    expect(resolveWebSocketBaseUrl("ws://localhost:8000", "https:")).toBe(
      "ws://localhost:8000",
    );
  });

  it("keeps message listeners registered after disconnect", () => {
    const manager = new WebSocketManager();
    const testManager = manager as unknown as WebSocketManagerEmitter;
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

  describe("throttled ticket fetch", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(Math, "random").mockReturnValue(0);
      vi.mocked(bffWsTicket).mockReset();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    function throttleError(retryAfterSeconds?: string) {
      return {
        isAxiosError: true,
        response: {
          status: 429,
          headers: retryAfterSeconds
            ? { "retry-after": retryAfterSeconds }
            : {},
        },
      };
    }

    it("waits for Retry-After before retrying and does not burn reconnect attempts", async () => {
      const manager = new WebSocketManager();
      vi.mocked(bffWsTicket).mockRejectedValue(throttleError("42"));

      manager.connect();
      await vi.advanceTimersByTimeAsync(0);

      expect(bffWsTicket).toHaveBeenCalledTimes(1);
      expect(manager.getStatus()).toBe("reconnecting");

      await vi.advanceTimersByTimeAsync(41_000);
      expect(bffWsTicket).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(bffWsTicket).toHaveBeenCalledTimes(2);

      const internals = manager as unknown as { reconnectAttempt: number };
      expect(internals.reconnectAttempt).toBe(0);
    });

    it("falls back to a default delay when 429 carries no Retry-After", async () => {
      const manager = new WebSocketManager();
      vi.mocked(bffWsTicket).mockRejectedValue(throttleError());

      manager.connect();
      await vi.advanceTimersByTimeAsync(0);
      expect(bffWsTicket).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(29_000);
      expect(bffWsTicket).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(bffWsTicket).toHaveBeenCalledTimes(2);
    });
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
