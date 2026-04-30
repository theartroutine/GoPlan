export type NotificationActor = {
  id: string;
  display_name: string;
  identify_tag: string | null;
};

export type TripInvitationPayload = {
  trip_id: string;
  trip_name: string;
  destination: string;
  start_date: string;
  end_date: string;
  invitation_id: string;
};

export type TripCancelledPayload = {
  trip_id: string;
  trip_name: string;
};

export type TripMemberRemovedPayload = {
  trip_id: string;
  trip_name: string;
};

export type TripTimelineReminderPayload = {
  trip_id: string;
  trip_name: string;
  activity_id: string;
  activity_title: string;
  section_label: string;
  activity_date: string;
  activity_time: string;
  location_label: string;
};

export type TripInvitationRespondedPayload = {
  trip_id: string;
  trip_name: string;
  accepted_by_name?: string;
  declined_by_name?: string;
};

export type NotificationType =
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPTED"
  | "TRIP_INVITATION"
  | "TRIP_INVITATION_ACCEPTED"
  | "TRIP_INVITATION_DECLINED"
  | "TRIP_CANCELLED"
  | "TRIP_MEMBER_REMOVED"
  | "TRIP_TIMELINE_REMINDER";

export type Notification = {
  id: string;
  notification_type: NotificationType;
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
