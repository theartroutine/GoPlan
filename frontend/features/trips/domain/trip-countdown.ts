import type { TripStatus } from "@/features/trips/domain/types";

export type TripCountdownState =
  | { kind: "future"; daysUntilStart: number }
  | { kind: "in_progress" }
  | { kind: "past"; daysSinceEnd: number }
  | { kind: "cancelled" };

type Input = {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  status: TripStatus;
  today: string; // YYYY-MM-DD (caller supplies for testability)
};

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcMs(value: string): number {
  const m = PATTERN.exec(value);
  if (!m) throw new RangeError(`Invalid date-only value: ${value}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function getTripCountdownState(input: Input): TripCountdownState {
  if (input.status === "CANCELLED") return { kind: "cancelled" };

  const todayMs = toUtcMs(input.today);
  const startMs = toUtcMs(input.start);
  const endMs = toUtcMs(input.end);

  if (todayMs < startMs) {
    return {
      kind: "future",
      daysUntilStart: Math.round((startMs - todayMs) / MS_PER_DAY),
    };
  }
  if (todayMs > endMs) {
    return {
      kind: "past",
      daysSinceEnd: Math.round((todayMs - endMs) / MS_PER_DAY),
    };
  }
  return { kind: "in_progress" };
}

export function getTodayDateOnly(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
