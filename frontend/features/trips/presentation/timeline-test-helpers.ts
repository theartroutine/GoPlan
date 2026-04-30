import type {
  TimelineActivity,
  TimelineResponse,
  TimelineSection,
} from "@/features/trips/domain/types";

export function buildTimelineResponse(
  overrides: Partial<TimelineResponse> = {},
): TimelineResponse {
  return {
    trip_timezone: "Asia/Ho_Chi_Minh",
    permissions: {
      can_edit_timeline: false,
      can_manage_custom_types: false,
      can_create_sections: false,
      ...(overrides.permissions ?? {}),
    },
    system_types: overrides.system_types ?? [
      { code: "TRANSPORTATION", label: "Transportation", color_token: "sky", icon_key: "bus" },
    ],
    custom_types: overrides.custom_types ?? [],
    sections: overrides.sections ?? [],
  };
}

export function buildTimelineSection(
  overrides: Partial<TimelineSection> = {},
): TimelineSection {
  return {
    id: "sec_1",
    section_date: "2026-06-01",
    label: "Day 1",
    is_label_custom: false,
    position: 0,
    is_in_trip_range: true,
    activities: [],
    ...overrides,
  };
}

export function buildTimelineActivity(
  overrides: Partial<TimelineActivity> = {},
): TimelineActivity {
  return {
    id: "act_1",
    title: "Sample activity",
    time_mode: "AT_TIME",
    start_time: "09:00:00",
    end_time: null,
    status: "UPCOMING",
    position: 0,
    activity_type: { kind: "SYSTEM", code: "TRANSPORTATION", label: "Transportation", color_token: "sky", icon_key: "bus" },
    assignee_scope: "NONE",
    assignee: null,
    location: { location_mode: "MANUAL", location_label: "", location_note: "", open_url: null, place: null },
    note: "",
    meeting_point: "",
    contact_name: "",
    contact_phone: "",
    booking_reference: "",
    external_link: "",
    reminder_offsets_minutes: [],
    capabilities: { can_edit: false, can_delete: false, can_update_status: false },
    ...overrides,
  };
}
