import { describe, expect, it } from "vitest";

import {
  buildTimelineActivity,
  buildTimelineSection,
} from "@/features/trips/presentation/timeline-test-helpers";
import {
  findNowDividerIndex,
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

  it("focuses the first in-range day before the trip range when an extra day exists", () => {
    const focusedSectionId = getDefaultFocusedSectionId(
      [
        buildTimelineSection({
          id: "pre-trip",
          section_date: "2026-05-31",
          label: "Preparation",
          is_in_trip_range: false,
        }),
        buildTimelineSection({
          id: "day-1",
          section_date: "2026-06-01",
          label: "Day 1",
          is_in_trip_range: true,
        }),
        buildTimelineSection({
          id: "day-2",
          section_date: "2026-06-02",
          label: "Day 2",
          is_in_trip_range: true,
        }),
      ],
      "Asia/Ho_Chi_Minh",
      new Date("2026-05-30T12:00:00.000Z"),
    );

    expect(focusedSectionId).toBe("day-1");
  });

  it("focuses the last in-range day after the trip range when an extra day exists", () => {
    const focusedSectionId = getDefaultFocusedSectionId(
      [
        buildTimelineSection({
          id: "day-1",
          section_date: "2026-06-01",
          label: "Day 1",
          is_in_trip_range: true,
        }),
        buildTimelineSection({
          id: "day-2",
          section_date: "2026-06-02",
          label: "Day 2",
          is_in_trip_range: true,
        }),
        buildTimelineSection({
          id: "recovery",
          section_date: "2026-06-03",
          label: "Recovery",
          is_in_trip_range: false,
        }),
      ],
      "Asia/Ho_Chi_Minh",
      new Date("2026-06-04T12:00:00.000Z"),
    );

    expect(focusedSectionId).toBe("day-2");
  });

  it("falls back to the first in-range day when today is between in-range dates", () => {
    const sections = [
      buildTimelineSection({
        id: "day-1",
        section_date: "2026-06-01",
        label: "Day 1",
        is_in_trip_range: true,
      }),
      buildTimelineSection({
        id: "day-3",
        section_date: "2026-06-03",
        label: "Day 3",
        is_in_trip_range: true,
      }),
    ];

    expect(
      getDefaultFocusedSectionId(
        sections,
        "Asia/Ho_Chi_Minh",
        new Date("2026-06-02T02:00:00.000Z"),
      ),
    ).toBe("day-1");
  });

  it("focuses today's day when today matches an extra day", () => {
    const focusedSectionId = getDefaultFocusedSectionId(
      [
        buildTimelineSection({
          id: "day-1",
          section_date: "2026-06-01",
          label: "Day 1",
          is_in_trip_range: true,
        }),
        buildTimelineSection({
          id: "extra",
          section_date: "2026-06-04",
          label: "Recovery",
          is_in_trip_range: false,
        }),
      ],
      "Asia/Ho_Chi_Minh",
      new Date("2026-06-04T02:00:00.000Z"),
    );

    expect(focusedSectionId).toBe("extra");
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

describe("findNowDividerIndex", () => {
  it("returns the index of the section matching today", () => {
    const sections = [
      buildTimelineSection({ id: "a", section_date: "2026-04-26" }),
      buildTimelineSection({ id: "b", section_date: "2026-04-27" }),
      buildTimelineSection({ id: "c", section_date: "2026-04-28" }),
    ];
    expect(findNowDividerIndex(sections, "2026-04-27")).toBe(1);
  });

  it("returns null when today is before all sections", () => {
    const sections = [
      buildTimelineSection({ section_date: "2026-04-27" }),
      buildTimelineSection({ section_date: "2026-04-28" }),
    ];
    expect(findNowDividerIndex(sections, "2026-04-25")).toBeNull();
  });

  it("returns null when today is after all sections", () => {
    const sections = [
      buildTimelineSection({ section_date: "2026-04-26" }),
      buildTimelineSection({ section_date: "2026-04-27" }),
    ];
    expect(findNowDividerIndex(sections, "2026-04-29")).toBeNull();
  });

  it("returns the last index when today is the last section", () => {
    const sections = [
      buildTimelineSection({ id: "a", section_date: "2026-04-27" }),
      buildTimelineSection({ id: "b", section_date: "2026-04-28" }),
    ];
    expect(findNowDividerIndex(sections, "2026-04-28")).toBe(1);
  });

  it("returns null for an empty sections array", () => {
    expect(findNowDividerIndex([], "2026-04-28")).toBeNull();
  });
});
