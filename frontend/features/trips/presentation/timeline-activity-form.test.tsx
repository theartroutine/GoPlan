import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimelineActivityForm } from "@/features/trips/presentation/timeline-activity-form";
import type {
  TimelineCustomTypeMeta,
  TimelineSystemTypeMeta,
  TripMemberItem,
} from "@/features/trips/domain/types";

const SYSTEM_TYPES: TimelineSystemTypeMeta[] = [
  { code: "TRANSPORTATION", label: "Transportation", color_token: "sky", icon_key: "bus" },
  { code: "OTHER", label: "Other", color_token: "slate", icon_key: "tag" },
];

const CUSTOM_TYPES: TimelineCustomTypeMeta[] = [];

const MEMBERS: TripMemberItem[] = [
  {
    membership_id: "m1",
    user: { id: "user-1", display_name: "Linh", identify_tag: "linh#ABC123" },
    role: "MEMBER",
    joined_at: "2026-04-01",
  },
];

describe("TimelineActivityForm", () => {
  it("blocks submission when title is blank", () => {
    const onSubmit = vi.fn();
    render(
      <TimelineActivityForm
        members={MEMBERS}
        systemTypes={SYSTEM_TYPES}
        customTypes={CUSTOM_TYPES}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.submit(screen.getByRole("button", { name: /add activity/i }).closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid AT_TIME activity payload", () => {
    const onSubmit = vi.fn();
    render(
      <TimelineActivityForm
        members={MEMBERS}
        systemTypes={SYSTEM_TYPES}
        customTypes={CUSTOM_TYPES}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Bus to Da Lat" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "06:30" } });
    fireEvent.click(screen.getByRole("button", { name: /add activity/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.title).toBe("Bus to Da Lat");
    expect(payload.time_mode).toBe("AT_TIME");
    expect(payload.start_time).toBe("06:30:00");
    expect(payload.end_time).toBeNull();
    expect(payload.system_type).toBe("OTHER");
    expect(payload.place).toBeNull();
    expect(payload.location_mode).toBe("MANUAL");
  });

  it("rejects TIME_RANGE when end is not after start", () => {
    const onSubmit = vi.fn();
    render(
      <TimelineActivityForm
        members={MEMBERS}
        systemTypes={SYSTEM_TYPES}
        customTypes={CUSTOM_TYPES}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Hike" } });
    const [timeMode] = screen.getAllByRole("combobox");
    fireEvent.change(timeMode, { target: { value: "TIME_RANGE" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: /add activity/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/end time must be after start time/i)).toBeTruthy();
  });
});
