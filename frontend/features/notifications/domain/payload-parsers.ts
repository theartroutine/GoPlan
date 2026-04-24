import type { TripInvitationPayload } from "@/features/notifications/domain/types";

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
    typeof p.end_date !== "string"
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
  };
}
