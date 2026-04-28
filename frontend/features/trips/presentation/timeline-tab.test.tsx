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

  it("renders the captain empty state when there are no activities", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [buildTimelineSection({ activities: [] })],
      }),
    );
    render(<TimelineTab />);
    expect(await screen.findByText("Start building your timeline")).not.toBeNull();
  });

  it("renders the member empty state when read-only", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({ sections: [buildTimelineSection({ activities: [] })] }),
    );
    render(<TimelineTab />);
    expect(await screen.findByText("Timeline is not ready yet")).not.toBeNull();
  });

  it("renders sections and activities when timeline has content", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            label: "Day 1",
            activities: [buildTimelineActivity({ title: "Bus to Da Lat" })],
          }),
        ],
      }),
    );
    render(<TimelineTab />);
    await waitFor(() => {
      expect(screen.getByText("Day 1")).not.toBeNull();
      expect(screen.getByText("Bus to Da Lat")).not.toBeNull();
    });
  });

  it("shows an error message when the fetch fails", async () => {
    tripsApiMock.bffGetTimeline.mockRejectedValueOnce(new Error("boom"));
    render(<TimelineTab />);
    expect(await screen.findByText("Failed to load timeline.")).not.toBeNull();
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

  it("allows deleting an empty extra day", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: "Delete Preparation" }));

    expect(screen.getByText("Delete day?")).not.toBeNull();
    expect(screen.getByText('This will permanently delete "Preparation".')).not.toBeNull();
  });

  it("does not allow deleting an empty in-range day", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "required-day",
            label: "Day 2",
            section_date: "2026-06-02",
            is_in_trip_range: true,
            activities: [],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Day 2")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Day 2" })).toBeNull();
  });

  it("shows the date field when editing an in-range day", async () => {
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

  it("uses section id query state when same-date sections exist", async () => {
    mockUseSearchParams("section=extra-1");
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

  it("persists additional open sections in the URL", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            id: "section-1",
            label: "Day 1",
            section_date: "2026-06-01",
            activities: [buildTimelineActivity({ title: "Breakfast" })],
          }),
          buildTimelineSection({
            id: "section-2",
            label: "Day 2",
            section_date: "2026-06-02",
            position: 1,
            activities: [buildTimelineActivity({ title: "Lunch" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Day 2/i }));

    expect(navigationMock.replace).toHaveBeenCalledWith(
      "/trips/trip-1/timeline?section=section-2&openSections=section-1%2Csection-2",
      { scroll: false },
    );
  });

  it("groups expanded day activities by all-day timeline and flexible", async () => {
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

  it("renders a now marker in the focused current day timeline", async () => {
    vi.useFakeTimers({ now: new Date("2026-06-01T03:30:00.000Z") });
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        trip_timezone: "Asia/Ho_Chi_Minh",
        sections: [
          buildTimelineSection({
            id: "today",
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

    expect(screen.getByText("Now")).not.toBeNull();
    expect(screen.getByText("Museum").closest("[data-current='true']")).toBeTruthy();
  });
});
