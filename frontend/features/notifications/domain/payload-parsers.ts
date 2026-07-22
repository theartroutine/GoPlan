import type {
  TripInvitationPayload,
  TripInvitationStatus,
  TripTimelineReminderPayload,
} from "@/features/notifications/domain/types";

const TRIP_INVITATION_STATUSES = new Set<string>([
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "CANCELLED",
]);

function isTripInvitationStatus(
  value: unknown,
): value is TripInvitationStatus {
  return typeof value === "string" && TRIP_INVITATION_STATUSES.has(value);
}

export function parseTripInvitationPayload(
  raw: unknown
): TripInvitationPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.invitation_id !== "string" ||
    typeof p.trip_id !== "string" ||
    typeof p.trip_name !== "string" ||
    typeof p.destination !== "string" ||
    typeof p.start_date !== "string" ||
    typeof p.end_date !== "string" ||
    !isTripInvitationStatus(p.invitation_status)
  ) {
    return null;
  }
  return {
    invitation_id: p.invitation_id,
    trip_id: p.trip_id,
    trip_name: p.trip_name,
    destination: p.destination,
    start_date: p.start_date,
    end_date: p.end_date,
    invitation_status: p.invitation_status,
  };
}

export function parseTripTimelineReminderPayload(
  raw: unknown
): TripTimelineReminderPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.trip_id !== "string" ||
    typeof p.trip_name !== "string" ||
    typeof p.activity_id !== "string" ||
    typeof p.activity_title !== "string" ||
    typeof p.section_label !== "string" ||
    typeof p.activity_date !== "string" ||
    typeof p.activity_time !== "string" ||
    typeof p.location_label !== "string"
  ) {
    return null;
  }
  return {
    trip_id: p.trip_id,
    trip_name: p.trip_name,
    activity_id: p.activity_id,
    activity_title: p.activity_title,
    section_label: p.section_label,
    activity_date: p.activity_date,
    activity_time: p.activity_time,
    location_label: p.location_label,
  };
}
