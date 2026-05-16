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

import { DELETE, PATCH } from "@/app/api/auth/avatar/route";

describe("PATCH /api/auth/avatar", () => {
  const jar = { get: vi.fn() };
  const userPayload = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "owner@example.com",
    first_name: "Quang",
    last_name: "Minh",
    display_name: "Quang Minh",
    identify_name: "quangminh",
    identify_code: "ABC123",
    identify_tag: "quangminh#ABC123",
    avatar_url: "/media/avatars/a.webp",
    email_verified: true,
    is_profile_completed: true,
    requires_profile_setup: false,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    nextHeadersMock.cookies.mockResolvedValue(jar);
    sessionStateMock.setNoStoreHeaders.mockImplementation((response: Response) => response);
    sessionStateMock.handleRefreshFailure.mockReturnValue(null);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards a successful avatar upload to the auth service", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ user: userPayload }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const formData = new FormData();
    formData.append("avatar", new File(["avatar"], "avatar.webp", { type: "image/webp" }));

    const response = await PATCH({
      headers: new Headers({ Authorization: "Bearer access-token" }),
      formData: vi.fn().mockResolvedValue(formData),
    } as never);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/auth/avatar",
      expect.objectContaining({
        method: "PATCH",
        headers: { Authorization: "Bearer access-token" },
        body: expect.any(FormData),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ user: userPayload });
  });

  it("retries avatar upload with a refreshed access token after a stale caller token", async () => {
    jar.get.mockReturnValue({ value: "refresh-token" });
    refreshMock.refreshWithSingleFlight.mockResolvedValue({
      kind: "success",
      accessToken: "fresh-access-token",
      refreshToken: "fresh-refresh-token",
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Token is invalid." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: userPayload }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    const formData = new FormData();
    formData.append("avatar", new File(["avatar"], "avatar.webp", { type: "image/webp" }));

    const response = await PATCH({
      headers: new Headers({ Authorization: "Bearer stale-access-token" }),
      formData: vi.fn().mockResolvedValue(formData),
    } as never);

    expect(refreshMock.refreshWithSingleFlight).toHaveBeenCalledWith("refresh-token");
    expect(sessionStateMock.setRefreshToken).toHaveBeenCalledWith(
      jar,
      "fresh-refresh-token",
    );
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://api.example.com/api/auth/avatar",
      expect.objectContaining({
        method: "PATCH",
        headers: { Authorization: "Bearer stale-access-token" },
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://api.example.com/api/auth/avatar",
      expect.objectContaining({
        method: "PATCH",
        headers: { Authorization: "Bearer fresh-access-token" },
      }),
    );
    expect(response.headers.get("X-Access-Token")).toBe("fresh-access-token");
    await expect(response.json()).resolves.toEqual({ user: userPayload });
  });

  it("forwards a successful avatar delete to the auth service", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ user: { ...userPayload, avatar_url: null } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await DELETE({
      headers: new Headers({ Authorization: "Bearer access-token" }),
    } as never);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/auth/avatar",
      expect.objectContaining({
        method: "DELETE",
        headers: { Authorization: "Bearer access-token" },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { ...userPayload, avatar_url: null },
    });
  });

  it("forwards Retry-After from upstream avatar throttling responses", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ detail: "Request was throttled." }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "30",
        },
      }),
    );
    const formData = new FormData();
    formData.append("avatar", new File(["avatar"], "avatar.webp", { type: "image/webp" }));

    const response = await PATCH({
      headers: new Headers({ Authorization: "Bearer access-token" }),
      formData: vi.fn().mockResolvedValue(formData),
    } as never);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    await expect(response.json()).resolves.toEqual({
      detail: "Request was throttled.",
    });
  });

  it("does not relay non-JSON upstream error bodies to the browser", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("<!doctype html><title>debug traceback</title>", {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }),
    );
    const formData = new FormData();
    formData.append("avatar", new File(["avatar"], "avatar.webp", { type: "image/webp" }));

    const response = await PATCH({
      headers: new Headers({ Authorization: "Bearer access-token" }),
      formData: vi.fn().mockResolvedValue(formData),
    } as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      detail: "Avatar request failed.",
    });
  });
});
