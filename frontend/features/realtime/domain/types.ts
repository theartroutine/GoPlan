export type WsConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export type WsMessage = {
  type: string;
  [key: string]: unknown;
};
