import type {
  TimelineActivity,
  TimelineSection,
} from "@/features/trips/domain/types";

const MINUTES_PER_DAY = 24 * 60;

type LocalDateParts = {
  date: string;
  minutes: number;
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
  const systemSections = sortedSections.filter((section) => section.kind === "SYSTEM_DAY");

  if (systemSections.length > 0) {
    const firstSystemSection = systemSections[0];
    const lastSystemSection = systemSections[systemSections.length - 1];

    if (today < firstSystemSection.section_date) return firstSystemSection.id;
    if (today > lastSystemSection.section_date) return lastSystemSection.id;

    const todaySection = chooseSectionForDate(sortedSections, today);
    if (todaySection !== null) return todaySection.id;

    return firstSystemSection.id;
  }

  const todaySection = chooseSectionForDate(sortedSections, today);

  if (todaySection !== null) return todaySection.id;

  const firstSection = sortedSections[0];
  if (today < firstSection.section_date) {
    return chooseSectionForDate(sortedSections, firstSection.section_date)?.id ?? firstSection.id;
  }

  const lastSection = sortedSections[sortedSections.length - 1];
  if (today > lastSection.section_date) {
    return chooseSectionForDate(sortedSections, lastSection.section_date)?.id ?? lastSection.id;
  }

  return sortedSections.find((section) => section.kind === "SYSTEM_DAY")?.id ?? firstSection.id;
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
  const sameDateSections = sections.filter((section) => section.section_date === sectionDate);
  if (sameDateSections.length === 0) return null;

  return sameDateSections.find((section) => section.kind === "SYSTEM_DAY") ?? sameDateSections[0];
}
