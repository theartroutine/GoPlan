export type ChatSender = {
  id: string | null;
  display_name: string;
  identify_tag: string | null;
};

export type ChatMessage = {
  id: string;
  trip_id: string;
  sender: ChatSender;
  content: string;
  client_message_id: string | null;
  created_at: string;
};

export type ChatHistoryResponse = {
  results: ChatMessage[];
  next_cursor: string | null;
};

export type ChatGapFillResponse = {
  results: ChatMessage[];
  has_more: boolean;
};

export type SendChatMessageInput = {
  content: string;
  client_message_id: string;
};

export type SendChatMessageResult = {
  message: ChatMessage;
  /** 201 when newly created, 200 when an idempotent retry returned the existing row. */
  status: 200 | 201;
};

// -------- WebSocket payloads (browser wire format, dotted namespace) --------

export type WsChatSubscribe = {
  type: "chat.subscribe";
  trip_id: string;
};

export type WsChatUnsubscribe = {
  type: "chat.unsubscribe";
  trip_id: string;
};

export type WsChatSubscribed = {
  type: "chat.subscribed";
  trip_id: string;
};

export type WsChatUnsubscribed = {
  type: "chat.unsubscribed";
  trip_id: string;
};

export type WsChatMessagePush = {
  type: "chat.message";
  trip_id: string;
  message: ChatMessage;
};

export type WsChatKicked = {
  type: "chat.kicked";
  trip_id: string;
};

export type WsChatErrorCode =
  | "TRIP_NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_PAYLOAD"
  | "SERVER_ERROR";

export type WsChatError = {
  type: "chat.error";
  trip_id: string;
  error_code: WsChatErrorCode | string;
  detail: string;
};

export type WsChatClientMessage = WsChatSubscribe | WsChatUnsubscribe;

export type WsChatServerMessage =
  | WsChatSubscribed
  | WsChatUnsubscribed
  | WsChatMessagePush
  | WsChatKicked
  | WsChatError;
