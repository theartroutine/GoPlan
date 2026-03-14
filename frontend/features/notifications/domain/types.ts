export type NotificationActor = {
  id: string;
  display_name: string;
  identify_tag: string | null;
};

export type Notification = {
  id: string;
  notification_type: "FRIEND_REQUEST" | "FRIEND_ACCEPTED";
  actor: NotificationActor | null;
  payload: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export type NotificationListResponse = {
  next_cursor: string | null;
  previous_cursor: string | null;
  results: Notification[];
};

export type WsNotificationCreated = {
  type: "notification";
  event: "created";
  notification: Notification;
};

export type WsNotificationRead = {
  type: "notification";
  event: "read";
  notification_ids: string[];
};

export type WsNotificationReadAll = {
  type: "notification";
  event: "read_all";
};

export type WsNotificationMessage =
  | WsNotificationCreated
  | WsNotificationRead
  | WsNotificationReadAll;
