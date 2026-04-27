import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/features/trips/infrastructure/trips-api", () => tripsApiMock);

vi.mock("@/features/trips/presentation/trip-context", () => ({
  useTripContext: () => ({ tripId: "trip-1" }),
}));

import { TimelineTab } from "@/features/trips/presentation/timeline-tab";

describe("TimelineTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
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
});
