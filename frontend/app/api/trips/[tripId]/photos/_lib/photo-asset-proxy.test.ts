import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nextHeadersMock = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

const refreshMock = vi.hoisted(() => ({
  refreshWithSingleFlight: vi.fn(),
}));

const sessionStateMock = vi.hoisted(() => ({
  REFRESH_COOKIE_NAME: "refresh_token",
  handleRefreshFailure: vi.fn(),
  setNoStoreHeaders: vi.fn((response: Response) => response),
  setRefreshToken: vi.fn(),
}));

vi.mock("next/headers", () => nextHeadersMock);
vi.mock("@/app/api/auth/_lib/refresh", () => refreshMock);
vi.mock("@/app/api/auth/_lib/session-state", () => sessionStateMock);
vi.mock("@/shared/http/config", () => ({
  API_BASE_URL: "https://api.example.com",
}));

const TRIP_ID = "11111111-1111-1111-1111-111111111111";
const PHOTO_ID = "22222222-2222-4222-8222-222222222222";

describe("proxyTripPhotoAsset", () => {
  const jar = { get: vi.fn() };

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    nextHeadersMock.cookies.mockResolvedValue(jar);
    sessionStateMock.handleRefreshFailure.mockReturnValue(null);
    jar.get.mockReturnValue({ value: "refresh-cookie" });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("proxies image bytes with Authorization header", async () => {
    const { proxyTripPhotoAsset } = await import(
      "@/app/api/trips/[tripId]/photos/_lib/photo-asset-proxy"
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/webp" },
      }),
    );

    const response = await proxyTripPhotoAsset({
      request: { headers: new Headers({ Authorization: "Bearer access-token" }) } as never,
      tripId: TRIP_ID,
      photoId: PHOTO_ID,
      variant: "thumbnail",
    });

    expect(fetch).toHaveBeenCalledWith(
      `https://api.example.com/api/trips/${TRIP_ID}/photos/${PHOTO_ID}/thumbnail`,
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer access-token" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("returns JSON 401 without fetching upstream when no bearer or refresh cookie exists", async () => {
    const { proxyTripPhotoAsset } = await import(
      "@/app/api/trips/[tripId]/photos/_lib/photo-asset-proxy"
    );
    jar.get.mockReturnValue(undefined);

    const response = await proxyTripPhotoAsset({
      request: { headers: new Headers() } as never,
      tripId: TRIP_ID,
      photoId: PHOTO_ID,
      variant: "thumbnail",
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ detail: "Not authenticated." });
  });

  it("retries once with a refreshed token after upstream 401", async () => {
    const { proxyTripPhotoAsset } = await import(
      "@/app/api/trips/[tripId]/photos/_lib/photo-asset-proxy"
    );
    refreshMock.refreshWithSingleFlight.mockResolvedValue({
      kind: "success",
      accessToken: "fresh-access-token",
      refreshToken: "fresh-refresh-token",
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Token expired." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([9]), {
          status: 200,
          headers: { "Content-Type": "image/webp" },
        }),
      );

    const response = await proxyTripPhotoAsset({
      request: { headers: new Headers({ Authorization: "Bearer stale-access-token" }) } as never,
      tripId: TRIP_ID,
      photoId: PHOTO_ID,
      variant: "medium",
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `https://api.example.com/api/trips/${TRIP_ID}/photos/${PHOTO_ID}/medium`,
      expect.objectContaining({
        headers: { Authorization: "Bearer fresh-access-token" },
      }),
    );
    expect(sessionStateMock.setRefreshToken).toHaveBeenCalledWith(jar, "fresh-refresh-token");
    expect(response.headers.get("X-Access-Token")).toBe("fresh-access-token");
    expect(response.status).toBe(200);
  });

  it("returns JSON errors unchanged for non-image upstream failures", async () => {
    const { proxyTripPhotoAsset } = await import(
      "@/app/api/trips/[tripId]/photos/_lib/photo-asset-proxy"
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ detail: "Trip not found.", error_code: "TRIP_NOT_FOUND" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await proxyTripPhotoAsset({
      request: { headers: new Headers({ Authorization: "Bearer access-token" }) } as never,
      tripId: TRIP_ID,
      photoId: PHOTO_ID,
      variant: "thumbnail",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      detail: "Trip not found.",
      error_code: "TRIP_NOT_FOUND",
    });
  });
});
