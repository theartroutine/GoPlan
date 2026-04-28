import { describe, expect, it } from "vitest";

import {
  buildDayHref,
  buildOverviewHref,
  resolveTimelineUrlState,
} from "@/features/trips/presentation/timeline-url-state";

const sectionIds = new Set(["day-1", "day-2"]);

describe("timeline URL state", () => {
  it("builds a Day Detail href and removes legacy section params", () => {
    expect(buildDayHref("/trips/trip-1/timeline", "foo=bar&section=old&openSections=old", "day-2")).toBe(
      "/trips/trip-1/timeline?foo=bar&day=day-2",
    );
  });

  it("builds an Overview href and removes timeline view params", () => {
    expect(buildOverviewHref("/trips/trip-1/timeline", "foo=bar&day=day-2&section=old&openSections=old")).toBe(
      "/trips/trip-1/timeline?foo=bar",
    );
  });

  it("resolves a valid day param without replacement", () => {
    expect(
      resolveTimelineUrlState({
        pathname: "/trips/trip-1/timeline",
        search: "day=day-2",
        sectionIds,
      }),
    ).toEqual({ dayId: "day-2", replacementHref: null });
  });

  it("replaces invalid day params with Overview", () => {
    expect(
      resolveTimelineUrlState({
        pathname: "/trips/trip-1/timeline",
        search: "day=missing&foo=bar",
        sectionIds,
      }),
    ).toEqual({
      dayId: null,
      replacementHref: "/trips/trip-1/timeline?foo=bar",
    });
  });

  it("replaces empty day params with Overview", () => {
    expect(
      resolveTimelineUrlState({
        pathname: "/trips/trip-1/timeline",
        search: "day=&foo=bar",
        sectionIds,
      }),
    ).toEqual({
      dayId: null,
      replacementHref: "/trips/trip-1/timeline?foo=bar",
    });
  });

  it("normalizes legacy section to day and removes openSections", () => {
    expect(
      resolveTimelineUrlState({
        pathname: "/trips/trip-1/timeline",
        search: "section=day-1&openSections=day-1,day-2&foo=bar",
        sectionIds,
      }),
    ).toEqual({
      dayId: "day-1",
      replacementHref: "/trips/trip-1/timeline?foo=bar&day=day-1",
    });
  });

  it("lets day win when day and legacy params are both present", () => {
    expect(
      resolveTimelineUrlState({
        pathname: "/trips/trip-1/timeline",
        search: "day=day-2&section=day-1&openSections=day-1",
        sectionIds,
      }),
    ).toEqual({
      dayId: "day-2",
      replacementHref: "/trips/trip-1/timeline?day=day-2",
    });
  });

  it("removes openSections-only legacy state and stays in Overview", () => {
    expect(
      resolveTimelineUrlState({
        pathname: "/trips/trip-1/timeline",
        search: "openSections=day-1,day-2",
        sectionIds,
      }),
    ).toEqual({
      dayId: null,
      replacementHref: "/trips/trip-1/timeline",
    });
  });
});
