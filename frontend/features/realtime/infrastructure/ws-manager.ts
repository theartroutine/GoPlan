import type { WsConnectionStatus, WsMessage } from "@/features/realtime/domain/types";
import { bffRefresh } from "@/features/auth/infrastructure/auth-api";
import { tokenManager } from "@/features/auth/infrastructure/token-manager";

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_BACKOFF_MS = 30_000;

type MessageListener = (data: WsMessage) => void;
type StatusListener = (status: WsConnectionStatus) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private status: WsConnectionStatus = "disconnected";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  /** Prevents double handling when server sends auth_error message + close code. */
  private authErrorHandled = false;

  /** Prevents refresh storm: only one fallback refresh per reconnect cycle. */
  private refreshFallbackUsed = false;

  private messageListeners = new Map<string, Set<MessageListener>>();
  private statusListeners = new Set<StatusListener>();

  // -------- Public API --------

  connect(): void {
    const token = tokenManager.get();
    if (!token) return;

    this.authErrorHandled = false;
    this.setStatus("connecting");

    const url = `${WS_BASE_URL}/ws/connect?token=${encodeURIComponent(token)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.setStatus("connected");
      this.reconnectAttempt = 0;
      this.refreshFallbackUsed = false;
      this.startHeartbeat();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data as string) as WsMessage;

      if (data.type === "auth_error") {
        this.authErrorHandled = true;
        this.stopHeartbeat();
        void this.handleAuthError(data.code as string);
        return;
      }

      if (data.type === "pong") {
        this.clearHeartbeatTimeout();
        return;
      }

      this.emit(data.type, data);
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.stopHeartbeat();

      // If auth_error was already handled via onmessage, skip to avoid double handling
      if (this.authErrorHandled) return;

      // Fallback: honor auth close codes even if the auth_error message was missed
      if (event.code === 4002) {
        void this.handleAuthError("token_expired");
        return;
      }
      if (event.code === 4001) {
        void this.handleAuthError("auth_failed");
        return;
      }

      // Network/abnormal close — try fallback refresh then backoff
      void this.handleNetworkClose();
    };

    this.ws.onerror = () => {
      // Errors always precede close events; actual handling happens in onclose
    };
  }

  disconnect(): void {
    this.cancelReconnect();
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }

    this.setStatus("disconnected");
  }

  on(type: string, callback: MessageListener): () => void {
    let listeners = this.messageListeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.messageListeners.set(type, listeners);
    }
    listeners.add(callback);

    return () => {
      listeners!.delete(callback);
      if (listeners!.size === 0) {
        this.messageListeners.delete(type);
      }
    };
  }

  onStatusChange(callback: StatusListener): () => void {
    this.statusListeners.add(callback);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  getStatus(): WsConnectionStatus {
    return this.status;
  }

  // -------- Auth Error Handling --------

  private async handleAuthError(code: string): Promise<void> {
    if (code === "token_expired") {
      const refreshed = await this.tryRefreshAndReconnect();
      if (!refreshed) {
        this.setStatus("disconnected");
      }
      return;
    }

    // "auth_failed" (revoked, invalid, etc.) — do not retry
    this.setStatus("disconnected");
  }

  private async handleNetworkClose(): Promise<void> {
    if (!this.refreshFallbackUsed) {
      this.refreshFallbackUsed = true;
      const refreshed = await this.tryRefreshAndReconnect();
      if (refreshed) return;
    }

    this.scheduleReconnect();
  }

  private async tryRefreshAndReconnect(): Promise<boolean> {
    try {
      const data = await bffRefresh();
      tokenManager.set(data.access_token);
      this.connect();
      return true;
    } catch {
      return false;
    }
  }

  // -------- Reconnect --------

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.setStatus("disconnected");
      return;
    }

    this.setStatus("reconnecting");

    const baseDelay = Math.min(1000 * 2 ** this.reconnectAttempt, MAX_BACKOFF_MS);
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;

    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    this.refreshFallbackUsed = false;
  }

  // -------- Heartbeat --------

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
        this.setHeartbeatTimeout();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearHeartbeatTimeout();
  }

  private setHeartbeatTimeout(): void {
    this.clearHeartbeatTimeout();
    this.heartbeatTimeoutTimer = setTimeout(() => {
      // No pong received — assume dead connection
      this.ws?.close();
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  // -------- Internal --------

  private setStatus(newStatus: WsConnectionStatus): void {
    if (this.status === newStatus) return;
    this.status = newStatus;
    for (const listener of this.statusListeners) {
      listener(newStatus);
    }
  }

  private emit(type: string, data: WsMessage): void {
    const listeners = this.messageListeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        listener(data);
      }
    }
  }
}

export const wsManager = new WebSocketManager();
