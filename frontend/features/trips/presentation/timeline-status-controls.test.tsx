import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimelineActivityNode } from "@/features/trips/presentation/timeline-activity-node";
import { buildTimelineActivity } from "@/features/trips/presentation/timeline-test-helpers";

describe("TimelineActivityNode operational controls", () => {
  it("renders in-progress status as a pill menu", () => {
    const onStatusChange = vi.fn();
    render(
      <TimelineActivityNode
        activity={buildTimelineActivity({
          status: "IN_PROGRESS",
          capabilities: { can_edit: false, can_delete: false, can_update_status: true },
        })}
        onStatusChange={onStatusChange}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /change status/i }), {
      key: "Enter",
      code: "Enter",
    });
    fireEvent.click(screen.getByRole("menuitem", { name: /mark done/i }));

    expect(onStatusChange).toHaveBeenCalledWith("DONE");
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

  it("mutes done activities", () => {
    render(<TimelineActivityNode activity={buildTimelineActivity({ status: "DONE" })} />);
    expect(screen.getByText("Sample activity").closest("[data-status='DONE']")).toBeTruthy();
  });

  it("renders flexible activities with a schedule label", () => {
    render(
      <TimelineActivityNode
        activity={buildTimelineActivity({
          time_mode: "FLEXIBLE",
          start_time: null,
          end_time: null,
        })}
      />,
    );

    expect(screen.getByText("Flexible")).not.toBeNull();
  });

  it("keeps supplied actions inside the activity card", () => {
    render(
      <TimelineActivityNode
        activity={buildTimelineActivity()}
        actions={<button type="button">Edit Sample activity</button>}
      />,
    );

    const card = screen.getByText("Sample activity").closest("[data-status='UPCOMING']");
    const action = screen.getByRole("button", { name: "Edit Sample activity" });

    expect(card?.contains(action)).toBe(true);
  });

  it("renders operational details and map direction links", () => {
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
            location_mode: "STRUCTURED",
            location_label: "Gate B Bus Station",
            location_note: "Across from Gate B",
            open_url: "https://share.here.com/l/11.941,108.44,gate-b-bus-station",
            place: {
              provider: "here",
              provider_id: "here:place:gate-b",
              title: "Gate B Bus Station",
              address: "Da Lat",
              lat: 11.941,
              lng: 108.44,
            },
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
    expect(screen.getByRole("link", { name: "Open directions to Gate B Bus Station" }).getAttribute("href")).toBe(
      "https://share.here.com/l/11.941,108.44,gate-b-bus-station",
    );
  });
});
