import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimelineActivityNode } from "@/features/trips/presentation/timeline-activity-node";
import { buildTimelineActivity } from "@/features/trips/presentation/timeline-test-helpers";

describe("TimelineActivityNode operational controls", () => {
  it("calls status update when an activity can be started", () => {
    const onStatusChange = vi.fn();
    render(
      <TimelineActivityNode
        activity={buildTimelineActivity({
          status: "UPCOMING",
          capabilities: { can_edit: false, can_delete: false, can_update_status: true },
        })}
        onStatusChange={onStatusChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start activity" }));

    expect(onStatusChange).toHaveBeenCalledWith("IN_PROGRESS");
  });

  it("does not render status controls when status updates are not allowed", () => {
    render(
      <TimelineActivityNode
        activity={buildTimelineActivity({
          capabilities: { can_edit: false, can_delete: false, can_update_status: false },
        })}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Start activity" })).toBeNull();
  });

  it("renders operational details and opens map URLs", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <TimelineActivityNode
        activity={buildTimelineActivity({
          note: "Bring ID card",
          meeting_point: "Main gate",
          contact_name: "Homestay host",
          contact_phone: "0900000000",
          booking_reference: "HS-204",
          external_link: "https://example.com/booking/HS-204",
          location: {
            location_mode: "MANUAL",
            location_label: "Gate B Bus Station",
            location_note: "Across from Gate B",
            open_url: "https://share.here.com/r/Gate%20B%20Bus%20Station",
            place: null,
          },
        })}
      />,
    );

    expect(screen.getByText("Bring ID card")).not.toBeNull();
    expect(screen.getByText("Main gate")).not.toBeNull();
    expect(screen.getByText("Homestay host")).not.toBeNull();
    expect(screen.getByText("0900000000")).not.toBeNull();
    expect(screen.getByText("HS-204")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Open link" }).getAttribute("href")).toBe(
      "https://example.com/booking/HS-204",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open map" }));
    expect(openSpy).toHaveBeenCalledWith(
      "https://share.here.com/r/Gate%20B%20Bus%20Station",
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });
});
