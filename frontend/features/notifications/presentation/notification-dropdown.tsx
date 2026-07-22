"use client";

import { useRouter } from "next/navigation";

import { bffAcceptInvitation, bffDeclineInvitation } from "@/features/trips/infrastructure/trips-api";
import { useNotifications } from "@/features/notifications/application/notifications-context";
import { NotificationItem } from "@/features/notifications/presentation/notification-item";
import { Spinner } from "@/shared/ui/spinner";

export function NotificationDropdown() {
  const {
    unreadCount,
    notifications,
    isLoading,
    hasMore,
    isListLoaded,
    loadMore,
    markRead,
    markAllRead,
    confirmTripInvitationStatus,
  } = useNotifications();
  const router = useRouter();

  async function handleAcceptInvitation(invitationId: string, notificationId: string) {
    await bffAcceptInvitation(invitationId);
    confirmTripInvitationStatus(notificationId, "ACCEPTED");
    void markRead(notificationId);
    router.refresh();
  }

  async function handleDeclineInvitation(invitationId: string, notificationId: string) {
    await bffDeclineInvitation(invitationId);
    confirmTripInvitationStatus(notificationId, "DECLINED");
    void markRead(notificationId);
  }

  const canMarkAllRead =
    unreadCount > 0 || notifications.some((notification) => !notification.is_read);

  return (
    <div className="flex w-[calc(100vw-2rem)] max-w-96 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Notifications</h3>
        {canMarkAllRead && (
          <button
            type="button"
            className="shrink-0 text-xs text-blue-600 hover:text-blue-800"
            onClick={() => void markAllRead()}
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {!isListLoaded && isLoading && (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-5 w-5" />
          </div>
        )}

        {isListLoaded && notifications.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No notifications yet
          </p>
        )}

        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onMarkRead={markRead}
            onAcceptInvitation={handleAcceptInvitation}
            onDeclineInvitation={handleDeclineInvitation}
          />
        ))}

        {hasMore && (
          <div className="border-t px-4 py-2">
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              onClick={() => void loadMore()}
              disabled={isLoading}
            >
              {isLoading ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
