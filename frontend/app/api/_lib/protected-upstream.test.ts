import { beforeEach, describe, expect, it, vi } from "vitest";

const nextHeadersMock = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

const refreshMock = vi.hoisted(() => ({
  refreshWithSingleFlight: vi.fn(),
}));

const sessionStateMock = vi.hoisted(() => ({
  HARD_AUTH_ERROR_CODE: "hard_auth_failed",
  REFRESH_COOKIE_NAME: "refresh_token",
  clearRefreshAuthErrorMarker: vi.fn(),
  clearRefreshSession: vi.fn(),
  handleRefreshFailure: vi.fn(),
  setNoStoreHeaders: vi.fn((response: Response) => {
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  }),
  setRefreshToken: vi.fn(),
}));

const upstreamMock = vi.hoisted(() => ({
  callAuthUpstream: vi.fn(),
  extractDetail: vi.fn((_value: unknown, fallback: string) => fallback),
  normalizeErrorPayload: vi.fn((value: unknown, fallback: string) => {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value;
    }
    return { detail: fallback };
  }),
}));

vi.mock("next/headers", () => nextHeadersMock);
vi.mock("@/app/api/auth/_lib/refresh", () => refreshMock);
vi.mock("@/app/api/auth/_lib/session-state", () => sessionStateMock);
vi.mock("@/app/api/auth/_lib/upstream", () => upstreamMock);

describe("protectedUpstreamCall", () => {
  const jar = {
    get: vi.fn(),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    nextHeadersMock.cookies.mockResolvedValue(jar);
    sessionStateMock.handleRefreshFailure.mockReturnValue(null);
    jar.get.mockReturnValue(undefined);
  });

  it("preserves Retry-After when upstream throttles protected requests", async () => {
    const { protectedUpstreamCall } = await import(
      "@/app/api/_lib/protected-upstream"
    );

    upstreamMock.callAuthUpstream.mockResolvedValueOnce({
      kind: "response",
      ok: false,
      status: 429,
      data: { detail: "Request was throttled.", error_code: "THROTTLED" },
      headers: new Headers({ "Retry-After": "17" }),
    });

    const result = await protectedUpstreamCall({
      path: "/api/trips/11111111-1111-1111-1111-111111111111/chat/messages",
      method: "POST",
      body: JSON.stringify({ content: "hi" }),
      authorization: "Bearer access-token",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(429);
      expect(result.response.headers.get("Retry-After")).toBe("17");
      await expect(result.response.json()).resolves.toEqual({
        detail: "Request was throttled.",
        error_code: "THROTTLED",
      });
    }
  });

  it("marks refreshed access-token responses as no-store", async () => {
    const { buildProtectedResponse } = await import(
      "@/app/api/_lib/protected-upstream"
    );

    const response = buildProtectedResponse(
      { ok: true },
      "fresh-access-token",
    );

    expect(response.headers.get("X-Access-Token")).toBe("fresh-access-token");
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate, private",
    );
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(response.headers.get("Expires")).toBe("0");
  });

  it("rejects unsafe encoded path delimiters before calling upstream", async () => {
    const { protectedUpstreamCall } = await import(
      "@/app/api/_lib/protected-upstream"
    );

    const result = await protectedUpstreamCall({
      path: "/api/trips/11111111-1111-1111-1111-111111111111%2fmembers",
      method: "GET",
      authorization: "Bearer access-token",
    });

    expect(upstreamMock.callAuthUpstream).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({
        detail: "Invalid route parameter.",
        error_code: "INVALID_ROUTE_PARAMETER",
      });
    }
  });
});
