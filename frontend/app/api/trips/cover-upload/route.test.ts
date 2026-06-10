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

vi.mock("next/headers", () => nextHeadersMock);
vi.mock("@/app/api/auth/_lib/refresh", () => refreshMock);
vi.mock("@/app/api/auth/_lib/session-state", () => sessionStateMock);
vi.mock("@/shared/http/config", () => ({
  API_BASE_URL: "https://api.example.com",
}));

import { POST } from "@/app/api/trips/cover-upload/route";

describe("POST /api/trips/cover-upload", () => {
  const maxUploadBytes = 10 * 1024 * 1024;
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

  it("allows multipart body overhead when the file itself is within the limit", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new File([new Uint8Array(maxUploadBytes)], "max.png", { type: "image/png" }),
    );
    const request = {
      headers: new Headers({
        Authorization: "Bearer access-token",
        "Content-Length": String(maxUploadBytes + 1024),
      }),
      formData: vi.fn().mockResolvedValue(formData),
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ url: "https://cdn.example.com/max.png" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(request.formData).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({ url: "https://cdn.example.com/max.png" });
  });

  it("rejects oversized files before forwarding upstream", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new File([new Uint8Array(maxUploadBytes + 1)], "large.png", { type: "image/png" }),
    );
    const request = {
      headers: new Headers({
        Authorization: "Bearer access-token",
      }),
      formData: vi.fn().mockResolvedValue(formData),
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ url: "https://cdn.example.com/large.png" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(request as never);

    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      detail: "File too large. Maximum size is 10 MB.",
      error_code: "FILE_TOO_LARGE",
    });
  });

  it("rejects unsupported image types before forwarding upstream", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new File(["<svg/>"], "evil.svg", { type: "image/svg+xml" }),
    );
    const request = {
      headers: new Headers({
        Authorization: "Bearer access-token",
      }),
      formData: vi.fn().mockResolvedValue(formData),
    };

    const response = await POST(request as never);

    expect(response.status).toBe(415);
    expect(fetch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      detail: "Unsupported image type. Use JPEG, PNG, or WebP.",
      error_code: "UNSUPPORTED_MEDIA_TYPE",
    });
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
    expect(refreshMock.refreshWithSingleFlight).toHaveBeenCalledWith(
      "refresh-cookie",
      expect.any(Headers),
    );
    expect(sessionStateMock.setRefreshToken).toHaveBeenCalledWith(jar, "fresh-refresh-token");
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Access-Token")).toBe("fresh-access-token");
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate, private",
    );
    await expect(response.json()).resolves.toEqual({
      url: "https://cdn.example.com/cover.jpg",
    });
  });
});
