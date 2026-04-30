"use client";

import { useRouter } from "next/navigation";

import type { Notification } from "@/features/notifications/domain/types";
import { parseTripTimelineReminderPayload } from "@/features/notifications/domain/payload-parsers";
import { dispatchTimelineActivityFocus } from "@/features/trips/presentation/timeline-focus-events";
import { buildActivityHref } from "@/features/trips/presentation/timeline-url-state";
import { formatRelativeTime } from "@/shared/utils/relative-time";

type Props = {
  notification: Notification;
  onMarkRead: (id: string) => void | Promise<void>;
};

export function TimelineReminderNotification({ notification, onMarkRead }: Props) {
  const router = useRouter();
  const payload = parseTripTimelineReminderPayload(notification.payload);

  if (!payload) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground">
        Timeline reminder (details unavailable)
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
        notification.is_read ? "opacity-70" : ""
      }`}
      onClick={() => {
        if (!notification.is_read) {
          void onMarkRead(notification.id);
        }
        router.push(buildActivityHref(`/trips/${payload.trip_id}/timeline`, "", payload.activity_id), {
          scroll: false,
        });
        dispatchTimelineActivityFocus({
          tripId: payload.trip_id,
          activityId: payload.activity_id,
        });
      }}
    >
      {!notification.is_read && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
      )}
      <div className={`min-w-0 flex-1 ${notification.is_read ? "pl-5" : ""}`}>
        <p className="text-sm font-medium leading-snug">{payload.activity_title}</p>
        <p className="mt-0.5 text-sm text-primary">{payload.trip_name}</p>
        <p className="text-xs text-muted-foreground">
          {payload.section_label} · {payload.activity_date} · {payload.activity_time}
        </p>
        {payload.location_label && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {payload.location_label}
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatRelativeTime(notification.created_at)}
        </p>
      </div>
    </button>
  );
}
