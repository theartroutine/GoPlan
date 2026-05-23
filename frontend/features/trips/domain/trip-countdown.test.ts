import { describe, expect, it } from "vitest";

import {
  getTripCountdownState,
  type TripCountdownState,
} from "./trip-countdown";

const today = "2026-05-18"; // matches "today" for these tests

describe("getTripCountdownState", () => {
  it("returns 'future' with day count when trip starts in the future", () => {
    const state = getTripCountdownState({
      start: "2026-05-30",
      end: "2026-06-02",
      status: "PLANNING",
      today,
    });
    expect(state).toEqual<TripCountdownState>({
      kind: "future",
      daysUntilStart: 12,
    });
  });

  it("returns 'in_progress' when today is the start date", () => {
    const state = getTripCountdownState({
      start: today,
      end: "2026-05-22",
      status: "ONGOING",
      today,
    });
    expect(state).toEqual<TripCountdownState>({ kind: "in_progress" });
  });

  it("returns 'in_progress' when today is between start and end inclusive", () => {
    const state = getTripCountdownState({
      start: "2026-05-15",
      end: "2026-05-22",
      status: "ONGOING",
      today,
    });
    expect(state).toEqual<TripCountdownState>({ kind: "in_progress" });
  });

  it("returns 'past' with day count when trip ended", () => {
    const state = getTripCountdownState({
      start: "2026-05-01",
      end: "2026-05-10",
      status: "COMPLETED",
      today,
    });
    expect(state).toEqual<TripCountdownState>({
      kind: "past",
      daysSinceEnd: 8,
    });
  });

  it("returns 'cancelled' regardless of dates when status is CANCELLED", () => {
    const state = getTripCountdownState({
      start: "2026-05-30",
      end: "2026-06-02",
      status: "CANCELLED",
      today,
    });
    expect(state).toEqual<TripCountdownState>({ kind: "cancelled" });
  });

  it("returns 'future' with daysUntilStart = 1 the day before start", () => {
    const state = getTripCountdownState({
      start: "2026-05-19",
      end: "2026-05-22",
      status: "PLANNING",
      today,
    });
    expect(state).toEqual<TripCountdownState>({ kind: "future", daysUntilStart: 1 });
  });
});
