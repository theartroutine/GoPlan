"use client";

import type { Notification } from "@/features/notifications/domain/types";
import { formatRelativeTime } from "@/shared/utils/relative-time";

function renderNotificationText(notification: Notification): string {
  const actorName = notification.actor?.display_name ?? "Someone";

  switch (notification.notification_type) {
    case "FRIEND_REQUEST":
      return `${actorName} sent you a friend request`;
    case "FRIEND_ACCEPTED":
      return `${actorName} accepted your friend request`;
    default:
      return `${actorName} sent you a notification`;
  }
}

type NotificationItemProps = {
  notification: Notification;
  onMarkRead: (id: string) => void;
};

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  return (
    <button
      type="button"
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
        notification.is_read ? "opacity-70" : ""
      }`}
      onClick={() => {
        if (!notification.is_read) {
          onMarkRead(notification.id);
        }
      }}
    >
      {!notification.is_read && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
      )}
      <div className={`min-w-0 flex-1 ${notification.is_read ? "pl-5" : ""}`}>
        <p className="text-sm leading-snug">{renderNotificationText(notification)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatRelativeTime(notification.created_at)}
        </p>
      </div>
    </button>
  );
}
