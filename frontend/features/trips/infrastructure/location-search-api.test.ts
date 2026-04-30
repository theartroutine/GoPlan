import { beforeEach, describe, expect, it, vi } from "vitest";

const bffMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@/shared/http/bff-client", () => ({
  bff: bffMock,
}));

import {
  bffSuggestLocations,
  LocationSearchError,
} from "@/features/trips/infrastructure/location-search-api";

describe("location-search-api", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws a typed error instead of hiding failed suggest requests", async () => {
    bffMock.get.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 503,
        data: { detail: "HERE location search is disabled." },
      },
    });

    await expect(bffSuggestLocations("da")).rejects.toMatchObject({
      message: "HERE location search is disabled.",
      status: 503,
    } satisfies Partial<LocationSearchError>);
  });
});
