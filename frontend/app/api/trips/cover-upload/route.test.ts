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
  setRefreshToken: vi.fn(),
}));

vi.mock("next/headers", () => nextHeadersMock);
vi.mock("@/app/api/auth/_lib/refresh", () => refreshMock);
vi.mock("@/app/api/auth/_lib/session-state", () => sessionStateMock);
vi.mock("@/shared/http/config", () => ({
  API_BASE_URL: "https://api.example.com",
}));

import { POST } from "@/app/api/trips/cover-upload/route";

describe("POST /api/trips/cover-upload", () => {
  const jar = {
    get: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    nextHeadersMock.cookies.mockResolvedValue(jar);
    sessionStateMock.handleRefreshFailure.mockReturnValue(null);
    jar.get.mockImplementation((name: string) => {
      if (name === sessionStateMock.REFRESH_COOKIE_NAME) {
        return { value: "refresh-cookie" };
      }
      return undefined;
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes and retries when the provided bearer token is stale", async () => {
    refreshMock.refreshWithSingleFlight.mockResolvedValue({
      kind: "success",
      accessToken: "fresh-access-token",
      refreshToken: "fresh-refresh-token",
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Access token expired." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://cdn.example.com/cover.jpg" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const formData = new FormData();
    formData.append("file", new File(["cover"], "cover.png", { type: "image/png" }));

    const request = {
      headers: new Headers({
        Authorization: "Bearer stale-access-token",
      }),
      formData: vi.fn().mockResolvedValue(formData),
    };

    const response = await POST(request as never);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://api.example.com/api/media/trip-covers",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer stale-access-token" },
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://api.example.com/api/media/trip-covers",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer fresh-access-token" },
      }),
    );
    expect(refreshMock.refreshWithSingleFlight).toHaveBeenCalledWith("refresh-cookie");
    expect(sessionStateMock.setRefreshToken).toHaveBeenCalledWith(jar, "fresh-refresh-token");
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Access-Token")).toBe("fresh-access-token");
    await expect(response.json()).resolves.toEqual({
      url: "https://cdn.example.com/cover.jpg",
    });
  });
});
