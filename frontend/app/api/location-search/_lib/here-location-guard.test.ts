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
    delete process.env.HERE_LOCATION_SEARCH_CACHE_MAX_ENTRIES;
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

  it("applies the minute budget per authenticated bucket", () => {
    const env = {
      HERE_LOCATION_SEARCH_MAX_REQUESTS_PER_MINUTE: "1",
    };

    expect(
      consumeHereLocationSearchSlot({ bucketKey: "user-a", env, now: 1_000 })
        .allowed,
    ).toBe(true);
    expect(
      consumeHereLocationSearchSlot({ bucketKey: "user-a", env, now: 2_000 })
        .allowed,
    ).toBe(false);
    expect(
      consumeHereLocationSearchSlot({ bucketKey: "user-b", env, now: 3_000 })
        .allowed,
    ).toBe(true);
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

  it("evicts old cache entries when the cache entry budget is full", () => {
    process.env.HERE_LOCATION_SEARCH_CACHE_MAX_ENTRIES = "1";

    writeHereLocationSearchCache({
      key: "suggest:first",
      ttlMs: 10_000,
      value: [{ title: "First" }],
      now: 10_000,
    });
    writeHereLocationSearchCache({
      key: "suggest:second",
      ttlMs: 10_000,
      value: [{ title: "Second" }],
      now: 11_000,
    });

    expect(
      readHereLocationSearchCache<{ title: string }[]>({
        key: "suggest:first",
        now: 11_500,
      }),
    ).toBeNull();
    expect(
      readHereLocationSearchCache<{ title: string }[]>({
        key: "suggest:second",
        now: 11_500,
      }),
    ).toEqual([{ title: "Second" }]);
  });
});
