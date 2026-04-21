import { beforeEach, describe, expect, it } from "vitest";

import {
  consumeHereLocationSearchSlot,
  getHereLocationSearchAvailability,
  readHereLocationSearchCache,
  resetHereLocationSearchStateForTests,
  writeHereLocationSearchCache,
} from "@/app/api/location-search/_lib/here-location-guard";

describe("here-location-guard", () => {
  beforeEach(() => {
    resetHereLocationSearchStateForTests();
  });

  it("disables HERE search when the feature flag is off", () => {
    const availability = getHereLocationSearchAvailability({
      ENABLE_HERE_LOCATION_SEARCH: "false",
      HERE_API_KEY: "demo-key",
      NODE_ENV: "development",
    });

    expect(availability.enabled).toBe(false);
    expect(availability.detail).toContain("disabled");
  });

  it("disables HERE search in production even when the feature flag is on", () => {
    const availability = getHereLocationSearchAvailability({
      ENABLE_HERE_LOCATION_SEARCH: "true",
      HERE_API_KEY: "demo-key",
      NODE_ENV: "production",
    });

    expect(availability.enabled).toBe(false);
    expect(availability.detail).toContain("production");
  });

  it("blocks requests after the local minute budget is exhausted", () => {
    const env = {
      HERE_LOCATION_SEARCH_MAX_REQUESTS_PER_MINUTE: "2",
    };

    expect(consumeHereLocationSearchSlot({ env, now: 1_000 }).allowed).toBe(true);
    expect(consumeHereLocationSearchSlot({ env, now: 2_000 }).allowed).toBe(true);

    const blocked = consumeHereLocationSearchSlot({ env, now: 3_000 });

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("returns cached values until the ttl expires", () => {
    writeHereLocationSearchCache({
      key: "suggest:hanoi",
      ttlMs: 1_000,
      value: [{ title: "Hanoi" }],
      now: 10_000,
    });

    expect(
      readHereLocationSearchCache<{ title: string }[]>({
        key: "suggest:hanoi",
        now: 10_500,
      }),
    ).toEqual([{ title: "Hanoi" }]);

    expect(
      readHereLocationSearchCache<{ title: string }[]>({
        key: "suggest:hanoi",
        now: 11_500,
      }),
    ).toBeNull();
  });
});
