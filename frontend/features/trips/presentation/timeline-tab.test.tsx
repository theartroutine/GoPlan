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

  it("opens the special day form with the shared date picker entry point", async () => {
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
    fireEvent.click(await screen.findByRole("button", { name: "Add special day" }));

    expect(screen.getByText("Date *")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Pick a date" })).not.toBeNull();
  });

  it("disables dates that already have timeline days in the special day picker", async () => {
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
    fireEvent.click(await screen.findByRole("button", { name: "Add special day" }));
    vi.useFakeTimers({ now: new Date("2026-04-10T00:00:00.000Z") });
    fireEvent.click(screen.getByRole("button", { name: "Pick a date" }));
    vi.useRealTimers();

    const usedDateButton = screen.getByText("28").closest("button");
    expect(usedDateButton?.disabled).toBe(true);
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
    mockUseSearchParams("section=special-1");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            id: "system-1",
            kind: "SYSTEM_DAY",
            section_date: "2026-06-01",
            label: "Day 1",
            activities: [buildTimelineActivity({ id: "system-act", title: "System day activity" })],
          }),
          buildTimelineSection({
            id: "special-1",
            kind: "SPECIAL_DAY",
            section_date: "2026-06-01",
            label: "Preparation",
            position: 1,
            activities: [buildTimelineActivity({ id: "special-act", title: "Special day activity" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Preparation")).not.toBeNull();
    expect(screen.getByText("Special day activity")).not.toBeNull();
    expect(screen.queryByText("System day activity")).toBeNull();
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

  it("allows the focused section to collapse", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            id: "section-1",
            label: "Day 1",
            activities: [buildTimelineActivity({ title: "Breakfast" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Breakfast")).not.toBeNull();
    const dayButton = screen.getByRole("button", { name: /Day 1/i });
    expect(dayButton.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(dayButton);

    expect(dayButton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading", { name: "Timeline" })).toBeNull();
    expect(screen.getByText("1 scheduled")).not.toBeNull();
    expect(navigationMock.replace).toHaveBeenLastCalledWith(
      "/trips/trip-1/timeline?section=section-1&openSections=",
      { scroll: false },
    );
  });

  it("does not reopen a collapsed focused section when another section is opened", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            id: "section-1",
            label: "Day 1",
            section_date: "2026-06-01",
            activities: [buildTimelineActivity({ id: "breakfast", title: "Breakfast" })],
          }),
          buildTimelineSection({
            id: "section-2",
            label: "Day 2",
            section_date: "2026-06-02",
            activities: [buildTimelineActivity({ id: "lunch", title: "Lunch" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Breakfast")).not.toBeNull();
    const day1Button = screen.getByRole("button", { name: /Day 1/i });
    const day2Button = screen.getByRole("button", { name: /Day 2/i });

    fireEvent.click(day1Button);
    fireEvent.click(day2Button);

    expect(day1Button.getAttribute("aria-expanded")).toBe("false");
    expect(day2Button.getAttribute("aria-expanded")).toBe("true");
  });

  it("does not revive a closed day through URL sync when closing another day", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            id: "section-1",
            label: "Day 1",
            section_date: "2026-06-01",
            activities: [buildTimelineActivity({ id: "breakfast", title: "Breakfast" })],
          }),
          buildTimelineSection({
            id: "section-2",
            label: "Day 2",
            section_date: "2026-06-02",
            activities: [buildTimelineActivity({ id: "lunch", title: "Lunch" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Breakfast")).not.toBeNull();
    const day1Button = screen.getByRole("button", { name: /Day 1/i });
    const day2Button = screen.getByRole("button", { name: /Day 2/i });

    fireEvent.click(day2Button);
    fireEvent.click(day1Button);
    fireEvent.click(day2Button);

    expect(day1Button.getAttribute("aria-expanded")).toBe("false");
    expect(day2Button.getAttribute("aria-expanded")).toBe("false");
    expect(navigationMock.replace).toHaveBeenLastCalledWith(
      "/trips/trip-1/timeline?section=section-2&openSections=",
      { scroll: false },
    );
  });

  it("keeps a re-closed focused day closed after another open day is closed", async () => {
    mockUseSearchParams("section=section-2");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            id: "section-1",
            label: "Day 0",
            section_date: "2026-05-31",
            activities: [buildTimelineActivity({ id: "prep", title: "Pack bags" })],
          }),
          buildTimelineSection({
            id: "section-2",
            label: "Day 1",
            section_date: "2026-06-01",
            activities: [buildTimelineActivity({ id: "arrival", title: "Arrival" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Arrival")).not.toBeNull();
    const day0Button = screen.getByRole("button", { name: /Day 0/i });
    const day1Button = screen.getByRole("button", { name: /Day 1/i });

    fireEvent.click(day0Button);
    expect(day0Button.getAttribute("aria-expanded")).toBe("true");
    expect(day1Button.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(day0Button);
    expect(day0Button.getAttribute("aria-expanded")).toBe("false");
    expect(day1Button.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(day1Button);
    expect(day0Button.getAttribute("aria-expanded")).toBe("false");
    expect(day1Button.getAttribute("aria-expanded")).toBe("false");
    expect(navigationMock.replace).toHaveBeenLastCalledWith(
      "/trips/trip-1/timeline?section=section-1&openSections=",
      { scroll: false },
    );
  });

  it("keeps a focused section closed when openSections is explicitly empty", async () => {
    mockUseSearchParams("section=section-1&openSections=");
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        sections: [
          buildTimelineSection({
            id: "section-1",
            label: "Day 1",
            activities: [buildTimelineActivity({ title: "Breakfast" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    const dayButton = await screen.findByRole("button", { name: /Day 1/i });

    expect(dayButton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Breakfast")).toBeNull();
    expect(screen.getByText("1 scheduled")).not.toBeNull();
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

  it("does not render a map action for manual locations even if stale open_url data exists", async () => {
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

  it("keeps the now marker visible when the current activity is beyond the collapsed limit", async () => {
    vi.useFakeTimers({ now: new Date("2026-06-01T06:30:00.000Z") });
    const activities = Array.from({ length: 7 }, (_, index) => {
      const startHour = String(8 + index).padStart(2, "0");
      const endHour = String(9 + index).padStart(2, "0");
      return buildTimelineActivity({
        id: `activity-${index + 1}`,
        title: `Activity ${index + 1}`,
        time_mode: "TIME_RANGE",
        start_time: `${startHour}:00:00`,
        end_time: `${endHour}:00:00`,
        position: index,
      });
    });
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        trip_timezone: "Asia/Ho_Chi_Minh",
        sections: [
          buildTimelineSection({
            id: "today",
            section_date: "2026-06-01",
            activities,
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("Now")).not.toBeNull();
    expect(screen.getByText("Activity 6").closest("[data-current='true']")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show 1 more" })).not.toBeNull();
  });

  it("hides special day delete while the section still has activities", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "special-1",
            kind: "SPECIAL_DAY",
            label: "Recovery",
            activities: [buildTimelineActivity({ title: "Checkout" })],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    expect(await screen.findByText("Recovery")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Recovery" })).toBeNull();
  });

  it("confirms deleting an empty special day without promising activity deletion", async () => {
    tripsApiMock.bffGetTimeline.mockResolvedValueOnce(
      buildTimelineResponse({
        permissions: {
          can_edit_timeline: true,
          can_manage_custom_types: true,
          can_create_sections: true,
        },
        sections: [
          buildTimelineSection({
            id: "special-1",
            kind: "SPECIAL_DAY",
            label: "Day 0",
            activities: [],
          }),
        ],
      }),
    );

    render(<TimelineTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Day 0" }));

    expect(await screen.findByText("Delete special day?")).not.toBeNull();
    expect(screen.getByText('This will permanently delete "Day 0".')).not.toBeNull();
    expect(screen.queryByText('This will permanently delete "Day 0" and its activities.')).toBeNull();
  });
});
