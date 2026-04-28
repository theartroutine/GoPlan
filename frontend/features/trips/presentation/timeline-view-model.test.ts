import { describe, expect, it } from "vitest";

import {
  buildTimelineActivity,
  buildTimelineSection,
} from "@/features/trips/presentation/timeline-test-helpers";
import {
  getDefaultFocusedSectionId,
  getNowMarkerPlacement,
  groupActivitiesForDay,
  limitActivityGroup,
} from "@/features/trips/presentation/timeline-view-model";

describe("timeline view model helpers", () => {
  it("groups activities by schedule mode", () => {
    const groups = groupActivitiesForDay([
      buildTimelineActivity({ id: "flex", title: "Coffee", time_mode: "FLEXIBLE", start_time: null, end_time: null, position: 2 }),
      buildTimelineActivity({ id: "all-day", title: "Museum", time_mode: "ALL_DAY", position: 1 }),
      buildTimelineActivity({ id: "range", title: "Dinner", time_mode: "TIME_RANGE", start_time: "18:00:00", end_time: "20:00:00", position: 0 }),
      buildTimelineActivity({ id: "at-time", title: "Flight", time_mode: "AT_TIME", start_time: "09:00:00", position: 1 }),
    ]);

    expect(groups.allDay.map((activity) => activity.id)).toEqual(["all-day"]);
    expect(groups.timeline.map((activity) => activity.id)).toEqual(["at-time", "range"]);
    expect(groups.flexible.map((activity) => activity.id)).toEqual(["flex"]);
  });

  it("focuses section ids instead of dates when same-date siblings exist and SYSTEM_DAY wins", () => {
    const focusedSectionId = getDefaultFocusedSectionId(
      [
        buildTimelineSection({
          id: "special-today",
          kind: "SPECIAL_DAY",
          section_date: "2026-06-01",
          label: "Birthday",
          position: 0,
        }),
        buildTimelineSection({
          id: "system-today",
          kind: "SYSTEM_DAY",
          section_date: "2026-06-01",
          label: "Day 1",
          position: 1,
        }),
        buildTimelineSection({
          id: "tomorrow",
          kind: "SYSTEM_DAY",
          section_date: "2026-06-02",
          label: "Day 2",
          position: 2,
        }),
      ],
      "Asia/Ho_Chi_Minh",
      new Date("2026-05-31T17:30:00.000Z"),
    );

    expect(focusedSectionId).toBe("system-today");
  });

  it("focuses the first system day before the trip range even when a pre-trip special day exists", () => {
    const focusedSectionId = getDefaultFocusedSectionId(
      [
        buildTimelineSection({
          id: "day-zero",
          kind: "SPECIAL_DAY",
          section_date: "2026-05-31",
          label: "Day 0",
          position: 0,
        }),
        buildTimelineSection({
          id: "system-day-1",
          kind: "SYSTEM_DAY",
          section_date: "2026-06-01",
          label: "Day 1",
          position: 0,
        }),
        buildTimelineSection({
          id: "system-day-2",
          kind: "SYSTEM_DAY",
          section_date: "2026-06-02",
          label: "Day 2",
          position: 1,
        }),
      ],
      "Asia/Ho_Chi_Minh",
      new Date("2026-05-31T05:00:00.000Z"),
    );

    expect(focusedSectionId).toBe("system-day-1");
  });

  it("focuses the last system day after the trip range even when a recovery special day exists", () => {
    const focusedSectionId = getDefaultFocusedSectionId(
      [
        buildTimelineSection({
          id: "system-day-1",
          kind: "SYSTEM_DAY",
          section_date: "2026-06-01",
          label: "Day 1",
          position: 0,
        }),
        buildTimelineSection({
          id: "system-day-2",
          kind: "SYSTEM_DAY",
          section_date: "2026-06-02",
          label: "Day 2",
          position: 1,
        }),
        buildTimelineSection({
          id: "recovery",
          kind: "SPECIAL_DAY",
          section_date: "2026-06-03",
          label: "Recovery",
          position: 0,
        }),
      ],
      "Asia/Ho_Chi_Minh",
      new Date("2026-06-03T05:00:00.000Z"),
    );

    expect(focusedSectionId).toBe("system-day-2");
  });

  it("falls back to the first sorted system day when today is between section dates", () => {
    const focusedSectionId = getDefaultFocusedSectionId(
      [
        buildTimelineSection({
          id: "future",
          kind: "SYSTEM_DAY",
          section_date: "2026-06-10",
          label: "Day 2",
          position: 1,
        }),
        buildTimelineSection({
          id: "first-special",
          kind: "SPECIAL_DAY",
          section_date: "2026-06-01",
          label: "Arrival",
          position: 0,
        }),
        buildTimelineSection({
          id: "first-system",
          kind: "SYSTEM_DAY",
          section_date: "2026-06-01",
          label: "Day 1",
          position: 1,
        }),
      ],
      "Asia/Ho_Chi_Minh",
      new Date("2026-06-05T05:00:00.000Z"),
    );

    expect(focusedSectionId).toBe("first-system");
  });

  it("limits visible group items and reports hidden count", () => {
    const collapsed = limitActivityGroup(["a", "b", "c", "d", "e", "f"], false);
    const expanded = limitActivityGroup(["a", "b", "c", "d", "e", "f"], true);
    const customLimit = limitActivityGroup(["a", "b", "c"], false, 2);

    expect(collapsed).toEqual({ visible: ["a", "b", "c", "d", "e"], hiddenCount: 1 });
    expect(expanded).toEqual({ visible: ["a", "b", "c", "d", "e", "f"], hiddenCount: 0 });
    expect(customLimit).toEqual({ visible: ["a", "b"], hiddenCount: 1 });
  });

  it("places now inside a time range", () => {
    const placement = getNowMarkerPlacement(
      [
        buildTimelineActivity({
          id: "range",
          time_mode: "TIME_RANGE",
          start_time: "09:00:00",
          end_time: "11:00:00",
        }),
      ],
      "Asia/Ho_Chi_Minh",
      new Date("2026-06-01T03:00:00.000Z"),
    );

    expect(placement).toEqual({ kind: "inside", activityId: "range" });
  });

  it("does not place now inside a time range at the end boundary", () => {
    const placement = getNowMarkerPlacement(
      [
        buildTimelineActivity({
          id: "range",
          time_mode: "TIME_RANGE",
          start_time: "09:00:00",
          end_time: "11:00:00",
        }),
      ],
      "Asia/Ho_Chi_Minh",
      new Date("2026-06-01T04:00:00.000Z"),
    );

    expect(placement).toEqual({ kind: "after", activityId: "range" });
  });

  it("places now before, between, and after scheduled activities", () => {
    const activities = [
      buildTimelineActivity({ id: "breakfast", time_mode: "AT_TIME", start_time: "08:00:00", position: 0 }),
      buildTimelineActivity({ id: "lunch", time_mode: "AT_TIME", start_time: "12:00:00", position: 1 }),
    ];

    expect(
      getNowMarkerPlacement(activities, "Asia/Ho_Chi_Minh", new Date("2026-06-01T00:30:00.000Z")),
    ).toEqual({ kind: "before", activityId: "breakfast" });
    expect(
      getNowMarkerPlacement(activities, "Asia/Ho_Chi_Minh", new Date("2026-06-01T03:00:00.000Z")),
    ).toEqual({
      kind: "between",
      previousActivityId: "breakfast",
      nextActivityId: "lunch",
    });
    expect(
      getNowMarkerPlacement(activities, "Asia/Ho_Chi_Minh", new Date("2026-06-01T06:00:00.000Z")),
    ).toEqual({ kind: "after", activityId: "lunch" });
  });

  it("places now before an at-time activity when local minutes equal the start time", () => {
    const placement = getNowMarkerPlacement(
      [
        buildTimelineActivity({
          id: "breakfast",
          time_mode: "AT_TIME",
          start_time: "08:00:00",
        }),
      ],
      "Asia/Ho_Chi_Minh",
      new Date("2026-06-01T01:00:00.000Z"),
    );

    expect(placement).toEqual({ kind: "before", activityId: "breakfast" });
  });
});
