import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRIP_COVER_URL,
  getTripCoverUrl,
} from "@/features/trips/domain/get-trip-cover-url";

describe("getTripCoverUrl", () => {
  it("returns uploaded trip cover URLs", () => {
    expect(getTripCoverUrl("/media/trip-covers/abc.jpg")).toBe(
      "/media/trip-covers/abc.jpg",
    );
  });

  it("falls back for external or malformed cover URLs", () => {
    expect(getTripCoverUrl("https://example.com/cover.jpg")).toBe(
      DEFAULT_TRIP_COVER_URL,
    );
    expect(getTripCoverUrl("/media/avatars/a.webp")).toBe(DEFAULT_TRIP_COVER_URL);
  });
});
