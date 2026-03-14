"use client";

import { Bell } from "lucide-react";
import { useState } from "react";

import { useNotifications } from "@/features/notifications/application/notifications-context";
import { NotificationDropdown } from "@/features/notifications/presentation/notification-dropdown";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover";

export function NotificationBell() {
  const { unreadCount, fetchNotifications } = useNotifications();
  const [open, setOpen] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      void fetchNotifications();
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className="w-auto p-0"
      >
        <NotificationDropdown />
      </PopoverContent>
    </Popover>
  );
}
