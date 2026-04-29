import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildTimelineActivity,
  buildTimelineResponse,
  buildTimelineSection,
} from "@/features/trips/presentation/timeline-test-helpers";

const tripsApiMock = vi.hoisted(() => ({
  bffCreateTimelineActivity: vi.fn(),
  bffCreateTimelineCustomType: vi.fn(),
  bffCreateTimelineSection: vi.fn(),
  bffDeleteTimelineActivity: vi.fn(),
  bffDeleteTimelineCustomType: vi.fn(),
  bffDeleteTimelineSection: vi.fn(),
  bffGetTimeline: vi.fn(),
  bffPatchTimelineActivity: vi.fn(),
  bffPatchTimelineCustomType: vi.fn(),
  bffPatchTimelineSection: vi.fn(),
  bffReorderTimelineActivities: vi.fn(),
  bffReorderTimelineSections: vi.fn(),
  bffUpdateTimelineActivityStatus: vi.fn(),
}));

const navigationMock = vi.hoisted(() => ({
  currentSearchParams: "",
  replace: vi.fn(),
}));

function mockUseSearchParams(value: string) {
  navigationMock.currentSearchParams = value;
}

vi.mock("@/features/trips/infrastructure/trips-api", () => tripsApiMock);

vi.mock("@/features/trips/presentation/trip-context", () => ({
  useTripContext: () => ({ tripId: "trip-1" }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/trips/trip-1/timeline",
  useRouter: () => ({ replace: navigationMock.replace }),
  useSearchParams: () => new URLSearchParams(navigationMock.currentSearchParams),
}));

import { TimelineTab } from "@/features/trips/presentation/timeline-tab";

describe("TimelineTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.useRealTimers();
    navigationMock.currentSearchParams = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the loading skeleton while the request is in flight", () => {
    tripsApiMock.bffGetTimeline.mockReturnValue(new Promise(() => {}));
    render(<TimelineTab />);
    expect(screen.getByTestId("timeline-skeleton")).not.toBeNull();
  });

  it("shows the captain empty state only when there are no sections", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Start building your timeline")).not.toBeNull();
  });

  it("shows the member empty state only when there are no sections", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(buildTimelineResponse({ sections: [] }));

    render(<TimelineTab />);

    expect(await screen.findByText("Timeline is not ready yet")).not.toBeNull();
  });

  it("renders overview day summaries without full activity cards and links to open the day", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            id: "day-1",
            label: "Day 1",
            activities: [
              buildTimelineActivity({
                id: "bus",
                title: "Bus to Da Lat",
                note: "Bring printed tickets",
                capabilities: { can_edit: true, can_delete: true, can_update_status: true },
              }),
            ],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Day 1")).not.toBeNull();
    expect(screen.getByText("1 scheduled")).not.toBeNull();
    expect(screen.queryByText("Bring printed tickets")).toBeNull();
    expect(screen.queryByRole("button", { name: "Change status" })).toBeNull();
    expect(screen.queryByText("Add activity")).toBeNull();

    const openDayLink = screen.getByRole("link", { name: "Open day" });
    expect(openDayLink.getAttribute("href")).toBe("/trips/trip-1/timeline?day=day-1");
  });

  it("hides Add activity in overview even when the timeline is editable", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "day-1",
            activities: [buildTimelineActivity({ title: "Breakfast" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Day 1")).not.toBeNull();
    expect(screen.queryByText("Add activity")).toBeNull();
  });

  it("renders overview day rows with No activities when sections exist but contain no activities", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "empty-day",
            label: "Preparation",
            activities: [],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Preparation")).not.toBeNull();
    expect(screen.getByText("No activities yet")).not.toBeNull();
    expect(screen.queryByText("Start building your timeline")).toBeNull();
  });

  it("shows permitted day edit and delete actions in overview", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "empty-day",
            label: "Preparation",
            section_date: "2026-05-31",
            is_in_trip_range: false,
            activities: [],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    fireEvent.keyDown(await screen.findByRole("button", { name: "Day options" }), {
      key: "Enter",
      code: "Enter",
    });
    expect(await screen.findByRole("menuitem", { name: /Edit day/i })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: /Delete day/i })).not.toBeNull();
  });

  it("hides overview day delete when a day still has activities", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "day-1",
            label: "Day 1",
            activities: [buildTimelineActivity({ title: "Breakfast" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    fireEvent.keyDown(await screen.findByRole("button", { name: "Day options" }), {
      key: "Enter",
      code: "Enter",
    });
    expect(await screen.findByRole("menuitem", { name: /Edit day/i })).not.toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Delete day/i })).toBeNull();
  });

  it("renders the overview-level now divider with the day label", async () => {
    vi.useFakeTimers({ now: new Date("2026-06-01T03:30:00.000Z") });
    mockUseSearchParams("filter=mine");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        trip_timezone: "Asia/Ho_Chi_Minh",
        sections: [
          buildTimelineSection({
            id: "today",
            label: "Day 1",
            section_date: "2026-06-01",
            activities: [buildTimelineActivity({ title: "Breakfast" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    await act(async () => {
      await Promise.resolve();
    });

    const nowLink = screen.getByRole("link", { name: "Now · Day 1 · 10:30" });
    expect(nowLink.getAttribute("href")).toBe("/trips/trip-1/timeline?filter=mine&day=today");
  });

  it("renders day detail when the day query references a valid section", async () => {
    mockUseSearchParams("day=day-1");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            id: "day-1",
            label: "Day 1",
            activities: [buildTimelineActivity({ title: "Bus to Da Lat", note: "Bring printed tickets" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Bus to Da Lat")).not.toBeNull();
    expect(screen.getByText("Bring printed tickets")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Back to timeline" })).not.toBeNull();
  });

  it("renders previous and next day navigation links in day detail", async () => {
    mockUseSearchParams("day=middle&filter=mine");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({ id: "previous", label: "Day 0", section_date: "2026-05-31" }),
          buildTimelineSection({ id: "middle", label: "Day 1", section_date: "2026-06-01" }),
          buildTimelineSection({ id: "next", label: "Day 2", section_date: "2026-06-02" }),
        ],
      }),
    );

    render(<TimelineTab />);

    const previousLink = await screen.findByRole("link", { name: "Previous day" });
    const nextLink = screen.getByRole("link", { name: "Next day" });

    expect(previousLink.getAttribute("href")).toBe(
      "/trips/trip-1/timeline?day=previous&filter=mine",
    );
    expect(nextLink.getAttribute("href")).toBe(
      "/trips/trip-1/timeline?day=next&filter=mine",
    );
  });

  it("uses day navigation as the action row in day detail", async () => {
    mockUseSearchParams("day=day-1");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({ id: "day-1", label: "Day 1", section_date: "2026-06-01" }),
          buildTimelineSection({ id: "day-2", label: "Day 2", section_date: "2026-06-02" }),
        ],
      }),
    );

    render(<TimelineTab />);

    const backLink = await screen.findByRole("link", { name: "Back to timeline" });
    const nextLink = screen.getByRole("link", { name: "Next day" });

    expect(backLink.getAttribute("href")).toBe("/trips/trip-1/timeline");
    expect(nextLink.getAttribute("href")).toBe("/trips/trip-1/timeline?day=day-2");
    expect(screen.queryByRole("button", { name: "Add day" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Manage types" })).toBeNull();
  });

  it("normalizes a legacy section query to day via router.replace", async () => {
    mockUseSearchParams("section=day-1&openSections=day-1&filter=mine");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [buildTimelineSection({ id: "day-1", label: "Day 1" })],
      }),
    );

    render(<TimelineTab />);

    await waitFor(() => {
      expect(navigationMock.replace).toHaveBeenCalledWith(
        "/trips/trip-1/timeline?filter=mine&day=day-1",
        { scroll: false },
      );
    });
  });

  it("falls back to overview and replaces the URL when day query is invalid", async () => {
    mockUseSearchParams("day=missing&filter=mine&openSections=day-1");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            id: "day-1",
            label: "Day 1",
            activities: [buildTimelineActivity({ title: "Breakfast" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Day 1")).not.toBeNull();
    expect(screen.queryByText("Breakfast")).toBeNull();
    expect(navigationMock.replace).toHaveBeenCalledWith(
      "/trips/trip-1/timeline?filter=mine",
      { scroll: false },
    );
  });

  it("renders all day detail activities without Show N more", async () => {
    mockUseSearchParams("day=day-1");
    const activities = Array.from({ length: 7 }, (_, index) =>
      buildTimelineActivity({
        id: `activity-${index + 1}`,
        title: `Activity ${index + 1}`,
        start_time: `${String(8 + index).padStart(2, "0")}:00:00`,
        position: index,
      }),
    );
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [buildTimelineSection({ id: "day-1", activities })],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Activity 7")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).toBeNull();
  });

  it("shows activity-level Now in today's day detail without the overview divider label", async () => {
    vi.useFakeTimers({ now: new Date("2026-06-01T03:30:00.000Z") });
    mockUseSearchParams("day=today");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        trip_timezone: "Asia/Ho_Chi_Minh",
        sections: [
          buildTimelineSection({
            id: "today",
            label: "Day 1",
            section_date: "2026-06-01",
            activities: [
              buildTimelineActivity({
                id: "breakfast",
                title: "Breakfast",
                time_mode: "AT_TIME",
                start_time: "08:00:00",
                position: 0,
              }),
              buildTimelineActivity({
                id: "museum",
                title: "Museum",
                time_mode: "TIME_RANGE",
                start_time: "10:00:00",
                end_time: "12:00:00",
                position: 1,
              }),
            ],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("Now · 10:30")).not.toBeNull();
    expect(screen.queryByText("Now · Day 1 · 10:30")).toBeNull();
    expect(screen.getByText("Museum").closest("[data-current='true']")).toBeTruthy();
  });

  it("preserves unrelated query params when linking back to timeline", async () => {
    mockUseSearchParams("day=day-1&filter=mine");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [buildTimelineSection({ id: "day-1", activities: [buildTimelineActivity()] })],
      }),
    );

    render(<TimelineTab />);

    const backLink = await screen.findByRole("link", { name: "Back to timeline" });
    expect(backLink.getAttribute("href")).toBe("/trips/trip-1/timeline?filter=mine");
    expect(backLink.getAttribute("data-variant")).toBe("default");
  });

  it("opens the existing Add Activity modal from day detail", async () => {
    mockUseSearchParams("day=day-1");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [buildTimelineSection({ id: "day-1", label: "Day 1" })],
      }),
    );

    render(<TimelineTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Add activity" }));

    expect(screen.getByRole("heading", { name: "Add Activity" })).not.toBeNull();
  });

  it("opens the existing Edit Activity modal from day detail with initial values", async () => {
    mockUseSearchParams("day=day-1");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "day-1",
            label: "Day 1",
            activities: [
              buildTimelineActivity({
                id: "activity-1",
                title: "Breakfast at market",
                capabilities: { can_edit: true, can_delete: false, can_update_status: false },
              }),
            ],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Breakfast at market" }));

    expect(screen.getByRole("heading", { name: "Edit Activity" })).not.toBeNull();
    expect(screen.getByLabelText("Title *")).toHaveProperty("value", "Breakfast at market");
  });

  it("opens the activity delete dialog from day detail", async () => {
    mockUseSearchParams("day=day-1");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "day-1",
            label: "Day 1",
            activities: [
              buildTimelineActivity({
                id: "activity-1",
                title: "Breakfast",
                capabilities: { can_edit: true, can_delete: true, can_update_status: true },
              }),
            ],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Breakfast" }));

    expect(await screen.findByText("Delete activity?")).not.toBeNull();
    expect(screen.getByText('This will permanently delete "Breakfast".')).not.toBeNull();
  });

  it("shows permitted day edit and delete actions in day detail", async () => {
    mockUseSearchParams("day=empty-day");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "empty-day",
            label: "Preparation",
            section_date: "2026-05-31",
            is_in_trip_range: false,
            activities: [],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByRole("button", { name: "Edit Preparation" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Delete Preparation" })).not.toBeNull();
  });

  it("opens the day form with the shared date picker entry point", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [],
      }),
    );

    render(<TimelineTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Add day" }));

    expect(screen.getByRole("heading", { name: "Add Day" })).not.toBeNull();
    expect(screen.getByText("Add a timeline day for preparation, recovery, or side plans.")).not.toBeNull();
    expect(screen.getByText("Date *")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Pick a date" })).not.toBeNull();
  });

  it("disables dates that already have timeline days in the day picker", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "day-1",
            label: "Day 1",
            section_date: "2026-04-28",
          }),
        ],
      }),
    );

    render(<TimelineTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Add day" }));
    vi.useFakeTimers({ now: new Date("2026-04-10T00:00:00.000Z") });
    fireEvent.click(screen.getByRole("button", { name: "Pick a date" }));
    vi.useRealTimers();

    const usedDateButton = screen.getByText("28").closest("button");
    expect(usedDateButton?.disabled).toBe(true);
  });

  it("shows the date field when editing an in-range day", async () => {
    mockUseSearchParams("day=in-range-day");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "in-range-day",
            label: "Day 1",
            section_date: "2026-06-01",
            is_in_trip_range: true,
            activities: [],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Day 1" }));

    expect(screen.getByText("Date *")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Selected June 1st, 2026/i })).not.toBeNull();
  });

  it("opens an alert dialog before deleting a custom activity type", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        custom_types: [
          {
            id: "custom-1",
            name: "Coffee",
            normalized_name: "coffee",
            color_token: "amber",
            icon_key: "cup",
            is_active: true,
          },
        ],
        sections: [],
      }),
    );

    render(<TimelineTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Manage types" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Delete custom type?")).not.toBeNull();
    expect(screen.getByText('This will permanently delete "Coffee".')).not.toBeNull();
  });

  it("guards dirty custom type input before closing Manage Types", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [],
      }),
    );

    render(<TimelineTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Manage types" }));
    fireEvent.change(screen.getByPlaceholderText("New custom type name"), {
      target: { value: "Coffee" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));

    expect(await screen.findByText("Discard changes?")).not.toBeNull();
    expect(screen.getByDisplayValue("Coffee")).not.toBeNull();
  });

  it("uses section id query state when same-date sections exist", async () => {
    mockUseSearchParams("day=extra-1");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            id: "system-1",
            section_date: "2026-06-01",
            label: "Day 1",
            is_in_trip_range: true,
            activities: [buildTimelineActivity({ id: "system-act", title: "Trip day activity" })],
          }),
          buildTimelineSection({
            id: "extra-1",
            section_date: "2026-06-01",
            label: "Preparation",
            position: 1,
            is_in_trip_range: false,
            activities: [buildTimelineActivity({ id: "extra-act", title: "Preparation activity" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Preparation")).not.toBeNull();
    expect(screen.getByText("Preparation activity")).not.toBeNull();
    expect(screen.queryByText("Trip day activity")).toBeNull();
  });

  it("groups day detail activities by all-day timeline and flexible", async () => {
    mockUseSearchParams("day=sec-1");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            id: "sec-1",
            activities: [
              buildTimelineActivity({ id: "all-day", title: "Beach day", time_mode: "ALL_DAY", start_time: null }),
              buildTimelineActivity({ id: "timed", title: "Breakfast", time_mode: "AT_TIME", start_time: "08:00:00" }),
              buildTimelineActivity({ id: "flex", title: "Buy souvenirs", time_mode: "FLEXIBLE", start_time: null }),
            ],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("All-day")).not.toBeNull();
    expect(screen.getByText("Timeline")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Flexible" })).not.toBeNull();
    expect(screen.getByText("Beach day")).not.toBeNull();
    expect(screen.getByText("Breakfast")).not.toBeNull();
    expect(screen.getByText("Buy souvenirs")).not.toBeNull();
  });

  it("does not render a map action for manual locations even if stale open_url data exists", async () => {
    mockUseSearchParams("day=sec-1");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            id: "sec-1",
            activities: [
              buildTimelineActivity({
                id: "manual-location",
                title: "Meet at Gate B",
                location: {
                  location_mode: "MANUAL",
                  location_label: "Gate B Bus Station",
                  location_note: "",
                  open_url: "https://share.here.com/r/Gate%20B%20Bus%20Station",
                  place: null,
                },
              }),
            ],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Meet at Gate B")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Open map" })).toBeNull();
  });

  it("updates activity status from day detail", async () => {
    mockUseSearchParams("day=sec-1");
    tripsApiMock.bffUpdateTimelineActivityStatus.mockResolvedValueOnce(undefined);
    tripsApiMock.bffGetTimeline
      .mockResolvedValueOnce(
        buildTimelineResponse({
          sections: [
            buildTimelineSection({
              id: "sec-1",
              activities: [
                buildTimelineActivity({
                  id: "activity-1",
                  title: "Breakfast",
                  capabilities: { can_edit: true, can_delete: true, can_update_status: true },
                }),
              ],
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        buildTimelineResponse({
          sections: [
            buildTimelineSection({
              id: "sec-1",
              activities: [
                buildTimelineActivity({
                  id: "activity-1",
                  title: "Breakfast",
                  status: "IN_PROGRESS",
                  capabilities: { can_edit: true, can_delete: true, can_update_status: true },
                }),
              ],
            }),
          ],
        }),
      );

    render(<TimelineTab />);

    fireEvent.keyDown(await screen.findByRole("button", { name: "Change status" }), {
      key: "Enter",
      code: "Enter",
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Start activity" }));

    await waitFor(() => {
      expect(tripsApiMock.bffUpdateTimelineActivityStatus).toHaveBeenCalledWith(
        "trip-1",
        "activity-1",
        { status: "IN_PROGRESS" },
      );
    });
  });

  it("hides extra day delete while the section still has activities", async () => {
    mockUseSearchParams("day=extra-1");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "extra-1",
            label: "Recovery",
            section_date: "2026-06-03",
            is_in_trip_range: false,
            activities: [buildTimelineActivity({ title: "Checkout" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Recovery")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Recovery" })).toBeNull();
  });

  it("confirms deleting an empty extra day without promising activity deletion", async () => {
    mockUseSearchParams("day=extra-1");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "extra-1",
            label: "Day 0",
            section_date: "2026-05-31",
            is_in_trip_range: false,
            activities: [],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Day 0" }));

    expect(await screen.findByText("Delete day?")).not.toBeNull();
    expect(screen.getByText('This will permanently delete "Day 0".')).not.toBeNull();
    expect(screen.queryByText('This will permanently delete "Day 0" and its activities.')).toBeNull();
  });
});
