"use client";

export const TIMELINE_ACTIVITY_FOCUS_EVENT = "goplan:timeline-activity-focus";

export type TimelineActivityFocusDetail = {
  tripId: string;
  activityId: string;
};

export function dispatchTimelineActivityFocus(detail: TimelineActivityFocusDetail) {
  window.dispatchEvent(
    new CustomEvent<TimelineActivityFocusDetail>(TIMELINE_ACTIVITY_FOCUS_EVENT, {
      detail,
    }),
  );
}

export function isTimelineActivityFocusEvent(
  event: Event,
): event is CustomEvent<TimelineActivityFocusDetail> {
  if (!(event instanceof CustomEvent)) return false;
  const detail = event.detail as Partial<TimelineActivityFocusDetail> | undefined;
  return typeof detail?.tripId === "string" && typeof detail.activityId === "string";
}
