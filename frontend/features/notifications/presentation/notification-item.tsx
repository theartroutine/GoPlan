"use client";

import type { Notification } from "@/features/notifications/domain/types";
import { TripInvitationNotification } from "@/features/notifications/presentation/trip-invitation-notification";
import { formatRelativeTime } from "@/shared/utils/relative-time";

function renderSimpleText(notification: Notification): string {
  const actorName = notification.actor?.display_name ?? "Someone";
  switch (notification.notification_type) {
    case "FRIEND_REQUEST":
      return `${actorName} sent you a friend request`;
    case "FRIEND_ACCEPTED":
      return `${actorName} accepted your friend request`;
    case "TRIP_INVITATION_ACCEPTED": {
      const name = (notification.payload as { accepted_by_name?: string }).accepted_by_name ?? actorName;
      return `${name} joined your trip`;
    }
    case "TRIP_INVITATION_DECLINED": {
      const name = (notification.payload as { declined_by_name?: string }).declined_by_name ?? actorName;
      return `${name} declined your trip invitation`;
    }
    case "TRIP_CANCELLED": {
      const tripName = (notification.payload as { trip_name?: string }).trip_name ?? "A trip";
      return `${tripName} has been cancelled`;
    }
    case "TRIP_MEMBER_REMOVED": {
      const tripName = (notification.payload as { trip_name?: string }).trip_name ?? "A trip";
      return `You were removed from ${tripName}`;
    }
    case "TRIP_INVITATION":
      return "";
    default: {
      const _exhaustive: never = notification.notification_type;
      void _exhaustive;
      return `${actorName} sent you a notification`;
    }
  }
}

type NotificationItemProps = {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onAcceptInvitation?: (invitationId: string, notificationId: string) => Promise<void>;
  onDeclineInvitation?: (invitationId: string, notificationId: string) => Promise<void>;
};

export function NotificationItem({
  notification,
  onMarkRead,
  onAcceptInvitation,
  onDeclineInvitation,
}: NotificationItemProps) {
  if (notification.notification_type === "TRIP_INVITATION") {
    return (
      <TripInvitationNotification
        notification={notification}
        onMarkRead={onMarkRead}
        onAccept={onAcceptInvitation ?? (async () => {})}
        onDecline={onDeclineInvitation ?? (async () => {})}
      />
    );
  }

  return (
    <button
      type="button"
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
        notification.is_read ? "opacity-70" : ""
      }`}
      onClick={() => { if (!notification.is_read) onMarkRead(notification.id); }}
    >
      {!notification.is_read && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
      )}
      <div className={`min-w-0 flex-1 ${notification.is_read ? "pl-5" : ""}`}>
        <p className="line-clamp-2 text-sm leading-snug">{renderSimpleText(notification)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatRelativeTime(notification.created_at)}
        </p>
      </div>
    </button>
  );
}
