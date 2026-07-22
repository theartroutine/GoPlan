import { describe, expect, it } from "vitest";

import type { TripInvitationStatus } from "@/features/notifications/domain/types";
import { parseTripInvitationPayload } from "@/features/notifications/domain/payload-parsers";

const BASE_PAYLOAD = {
  invitation_id: "invitation-1",
  trip_id: "trip-1",
  trip_name: "Da Nang Getaway",
  destination: "Da Nang",
  start_date: "2026-08-01",
  end_date: "2026-08-05",
};

describe("parseTripInvitationPayload", () => {
  it.each<TripInvitationStatus>([
    "PENDING",
    "ACCEPTED",
    "DECLINED",
    "CANCELLED",
  ])("accepts the %s invitation status", (invitationStatus) => {
    expect(
      parseTripInvitationPayload({
        ...BASE_PAYLOAD,
        invitation_status: invitationStatus,
      }),
    ).toEqual({
      ...BASE_PAYLOAD,
      invitation_status: invitationStatus,
    });
  });

  it.each([
    ["missing", BASE_PAYLOAD],
    ["null", { ...BASE_PAYLOAD, invitation_status: null }],
    ["unknown", { ...BASE_PAYLOAD, invitation_status: "EXPIRED" }],
    ["malformed payload", "not-an-object"],
  ])("fails closed for a %s invitation status", (_case, payload) => {
    expect(parseTripInvitationPayload(payload)).toBeNull();
  });
});
