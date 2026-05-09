export type WsConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export type WsMessage = {
  type: string;
  [key: string]: unknown;
};

/**
 * Browser WS message type identifiers contributed by the chat feature.
 * Listed here so the realtime layer can route them; payload schemas live in
 * `@/features/chat/domain/types`.
 */
export const CHAT_WS_MESSAGE_TYPES = {
  SUBSCRIBE: "chat.subscribe",
  UNSUBSCRIBE: "chat.unsubscribe",
  SUBSCRIBED: "chat.subscribed",
  UNSUBSCRIBED: "chat.unsubscribed",
  MESSAGE: "chat.message",
  KICKED: "chat.kicked",
  ERROR: "chat.error",
} as const;

export type ChatWsMessageType =
  (typeof CHAT_WS_MESSAGE_TYPES)[keyof typeof CHAT_WS_MESSAGE_TYPES];
