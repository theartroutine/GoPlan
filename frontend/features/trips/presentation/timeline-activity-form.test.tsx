import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TimelineActivityForm } from "@/features/trips/presentation/timeline-activity-form";
import {
  bffLookupLocation,
  bffSuggestLocations,
} from "@/features/trips/infrastructure/location-search-api";
import type {
  TimelineCustomTypeMeta,
  TimelineSystemTypeMeta,
  TripMemberItem,
} from "@/features/trips/domain/types";

vi.mock("@/features/trips/infrastructure/location-search-api", () => ({
  bffLookupLocation: vi.fn(),
  bffSuggestLocations: vi.fn(),
}));

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
  beforeEach(() => {
    vi.mocked(bffLookupLocation).mockReset();
    vi.mocked(bffSuggestLocations).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("submits Everyone as the activity assignee", () => {
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

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Meet at the beach" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "08:30" } });
    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "EVERYONE" } });
    fireEvent.click(screen.getByRole("button", { name: /add activity/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      assignee_scope: "EVERYONE",
      assignee_user_id: null,
    });
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

  it("submits FLEXIBLE without times or reminders", () => {
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

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Free coffee stop" } });
    fireEvent.change(screen.getByLabelText(/schedule/i), { target: { value: "FLEXIBLE" } });
    fireEvent.click(screen.getByRole("button", { name: /add activity/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      time_mode: "FLEXIBLE",
      start_time: null,
      end_time: null,
      reminder_offsets_minutes: [],
    });
  });

  it("clears reminders when switching from AT_TIME to ALL_DAY", () => {
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

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Museum day" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "09:00" } });
    fireEvent.click(screen.getByText("More Details"));
    fireEvent.click(screen.getByRole("button", { name: "30m" }));
    fireEvent.change(screen.getByLabelText(/schedule/i), { target: { value: "ALL_DAY" } });
    fireEvent.click(screen.getByRole("button", { name: /add activity/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      time_mode: "ALL_DAY",
      start_time: null,
      end_time: null,
      reminder_offsets_minutes: [],
    });
  });

  it("uses location search lookup for structured location payloads", async () => {
    vi.mocked(bffSuggestLocations).mockResolvedValue([
      {
        provider: "here",
        provider_id: "here:place:1",
        title: "Ho Xuan Huong",
        subtitle: "Da Lat, Lam Dong",
      },
    ]);
    vi.mocked(bffLookupLocation).mockResolvedValue({
      destination: "Ho Xuan Huong, Da Lat, Lam Dong",
      destination_provider: "here",
      destination_provider_id: "here:place:1",
      destination_lat: 11.940298,
      destination_lng: 108.458397,
      destination_country_code: "VN",
    });
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

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Coffee stop" } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "08:00" } });

    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: "Ho Xuan" },
    });
    await waitFor(() => {
      expect(bffSuggestLocations).toHaveBeenCalledWith("Ho Xuan", expect.any(AbortSignal));
    });

    fireEvent.mouseDown(await screen.findByText("Ho Xuan Huong"));
    await waitFor(() => expect(bffLookupLocation).toHaveBeenCalledWith("here:place:1", expect.any(AbortSignal)));

    fireEvent.click(screen.getByRole("button", { name: /add activity/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.location_mode).toBe("STRUCTURED");
    expect(payload.location_label).toBe("Ho Xuan Huong");
    expect(payload.place).toEqual({
      provider: "here",
      provider_id: "here:place:1",
      title: "Ho Xuan Huong",
      address: "Ho Xuan Huong, Da Lat, Lam Dong",
      lat: 11.940298,
      lng: 108.458397,
    });
  });
});
