import type {
  TimelineActivity,
  TimelineSection,
} from "@/features/trips/domain/types";

const MINUTES_PER_DAY = 24 * 60;

type LocalDateParts = {
  date: string;
  minutes: number;
};

export type OverviewHint = {
  prefix: "Next" | "Last";
  time: string;
  title: string;
};

export type NowMarkerPlacement =
  | { kind: "none" }
  | { kind: "before"; activityId: string }
  | { kind: "inside"; activityId: string }
  | { kind: "between"; previousActivityId: string; nextActivityId: string }
  | { kind: "after"; activityId: string };

export function groupActivitiesForDay(activities: TimelineActivity[]): {
  allDay: TimelineActivity[];
  timeline: TimelineActivity[];
  flexible: TimelineActivity[];
} {
  const allDay: TimelineActivity[] = [];
  const timeline: TimelineActivity[] = [];
  const flexible: TimelineActivity[] = [];

  for (const activity of activities) {
    if (activity.time_mode === "ALL_DAY") {
      allDay.push(activity);
    } else if (activity.time_mode === "FLEXIBLE") {
      flexible.push(activity);
    } else {
      timeline.push(activity);
    }
  }

  return {
    allDay: sortPositionThenTitle(allDay),
    timeline: sortScheduledActivities(timeline),
    flexible: sortPositionThenTitle(flexible),
  };
}

export function limitActivityGroup<T>(
  items: T[],
  expanded: boolean,
  initialLimit = 5,
): { visible: T[]; hiddenCount: number } {
  if (expanded) {
    return {
      visible: items,
      hiddenCount: 0,
    };
  }

  const visibleLimit = Math.max(0, initialLimit);

  return {
    visible: items.slice(0, visibleLimit),
    hiddenCount: Math.max(0, items.length - visibleLimit),
  };
}

export function getDefaultFocusedSectionId(
  sections: TimelineSection[],
  timeZone: string,
  now = new Date(),
): string | null {
  if (sections.length === 0) return null;

  const sortedSections = sortSections(sections);
  const today = localDateParts(timeZone, now).date;
  const todaySection = chooseSectionForDate(sortedSections, today);
  if (todaySection !== null) return todaySection.id;

  const inRangeSections = sortedSections.filter((section) => section.is_in_trip_range);
  if (inRangeSections.length > 0) {
    const firstInRange = inRangeSections[0];
    const lastInRange = inRangeSections[inRangeSections.length - 1];

    if (today < firstInRange.section_date) return firstInRange.id;
    if (today > lastInRange.section_date) return lastInRange.id;

    return firstInRange.id;
  }

  const firstSection = sortedSections[0];
  if (today < firstSection.section_date) return firstSection.id;

  const lastSection = sortedSections[sortedSections.length - 1];
  if (today > lastSection.section_date) return lastSection.id;

  return firstSection.id;
}

export function getNowMarkerPlacement(
  scheduledActivities: TimelineActivity[],
  timeZone: string,
  now = new Date(),
): NowMarkerPlacement {
  const nowMinutes = localDateParts(timeZone, now).minutes;
  const scheduledWithStart = sortScheduledActivities(scheduledActivities)
    .map((activity) => ({ activity, startMinutes: timeToMinutes(activity.start_time) }))
    .filter((entry): entry is { activity: TimelineActivity; startMinutes: number } => entry.startMinutes !== null);

  if (scheduledWithStart.length === 0) return { kind: "none" };

  const first = scheduledWithStart[0];
  if (nowMinutes < first.startMinutes) {
    return { kind: "before", activityId: first.activity.id };
  }

  for (let index = 0; index < scheduledWithStart.length; index += 1) {
    const current = scheduledWithStart[index];
    const currentEnd = timeToMinutes(current.activity.end_time);

    if (current.activity.time_mode === "AT_TIME" && nowMinutes === current.startMinutes) {
      return { kind: "before", activityId: current.activity.id };
    }

    if (
      current.activity.time_mode === "TIME_RANGE" &&
      currentEnd !== null &&
      nowMinutes >= current.startMinutes &&
      nowMinutes < currentEnd
    ) {
      return { kind: "inside", activityId: current.activity.id };
    }

    const next = scheduledWithStart[index + 1];
    if (next !== undefined && nowMinutes >= current.startMinutes && nowMinutes < next.startMinutes) {
      return {
        kind: "between",
        previousActivityId: current.activity.id,
        nextActivityId: next.activity.id,
      };
    }
  }

  return { kind: "after", activityId: scheduledWithStart[scheduledWithStart.length - 1].activity.id };
}

function timeToMinutes(value: string | null): number | null {
  if (value === null) return null;

  const [hourValue, minuteValue] = value.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

function localDateParts(timeZone: string, now: Date): LocalDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year") ?? "0000";
  const month = values.get("month") ?? "01";
  const day = values.get("day") ?? "01";
  const hour = Number(values.get("hour") ?? "0");
  const minute = Number(values.get("minute") ?? "0");

  return {
    date: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute,
  };
}

function sortSections(sections: TimelineSection[]): TimelineSection[] {
  return [...sections].sort((left, right) => {
    const dateComparison = left.section_date.localeCompare(right.section_date);
    if (dateComparison !== 0) return dateComparison;

    const positionComparison = left.position - right.position;
    if (positionComparison !== 0) return positionComparison;

    return left.label.localeCompare(right.label);
  });
}

function sortPositionThenTitle(activities: TimelineActivity[]): TimelineActivity[] {
  return [...activities].sort((left, right) => {
    const positionComparison = left.position - right.position;
    if (positionComparison !== 0) return positionComparison;

    return left.title.localeCompare(right.title);
  });
}

function sortScheduledActivities(activities: TimelineActivity[]): TimelineActivity[] {
  return [...activities].sort((left, right) => {
    const leftStart = timeToMinutes(left.start_time) ?? MINUTES_PER_DAY;
    const rightStart = timeToMinutes(right.start_time) ?? MINUTES_PER_DAY;
    const startComparison = leftStart - rightStart;
    if (startComparison !== 0) return startComparison;

    const positionComparison = left.position - right.position;
    if (positionComparison !== 0) return positionComparison;

    return left.title.localeCompare(right.title);
  });
}

function chooseSectionForDate(sections: TimelineSection[], sectionDate: string): TimelineSection | null {
  return sections.find((section) => section.section_date === sectionDate) ?? null;
}

export function findNowDividerIndex(sections: TimelineSection[], today: string): number | null {
  const index = sections.findIndex((section) => section.section_date === today);
  return index >= 0 ? index : null;
}

export function getActiveActivityIds(activities: TimelineActivity[], minutes: number): Set<string> {
  const active = new Set<string>();
  for (const activity of activities) {
    if (activity.time_mode !== "TIME_RANGE") continue;
    const start = timeToMinutes(activity.start_time);
    const end = timeToMinutes(activity.end_time);
    if (start !== null && end !== null && minutes >= start && minutes < end) {
      active.add(activity.id);
    }
  }
  return active;
}

export function formatSectionDate(sectionDate: string): string {
  const [year, month, day] = sectionDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function getOverviewHint(
  groups: ReturnType<typeof groupActivitiesForDay>,
  datePosition: "Today" | "Past" | "Upcoming",
): OverviewHint | null {
  if (datePosition === "Past") {
    const lastScheduled = groups.timeline[groups.timeline.length - 1];
    if (lastScheduled) {
      return { prefix: "Last", time: lastScheduled.start_time?.slice(0, 5) ?? "", title: lastScheduled.title };
    }
    const lastAllDay = groups.allDay[groups.allDay.length - 1];
    if (lastAllDay) {
      return { prefix: "Last", time: "", title: lastAllDay.title };
    }
    return null;
  }

  const nextScheduled = groups.timeline.find((a) => Boolean(a.start_time));
  if (nextScheduled) {
    return { prefix: "Next", time: nextScheduled.start_time?.slice(0, 5) ?? "", title: nextScheduled.title };
  }
  return null;
}
