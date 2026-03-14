"use client";

import { useNotifications } from "@/features/notifications/application/notifications-context";
import { NotificationItem } from "@/features/notifications/presentation/notification-item";
import { Spinner } from "@/shared/ui/spinner";

export function NotificationDropdown() {
  const {
    notifications,
    isLoading,
    hasMore,
    isListLoaded,
    loadMore,
    markRead,
    markAllRead,
  } = useNotifications();

  return (
    <div className="flex w-80 flex-col sm:w-96">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Notifications</h3>
        {notifications.some((n) => !n.is_read) && (
          <button
            type="button"
            className="text-xs text-blue-600 hover:text-blue-800"
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
