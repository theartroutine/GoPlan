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

const UPSTREAM_PATH =
  "/api/trips/11111111-1111-4111-8111-111111111111/memories/22222222-2222-4222-8222-222222222222/video";

function streamFrom(bytes: number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
}

function requestHeaders(values: Record<string, string>): Headers {
  const normalized = new Map(
    Object.entries(values).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    get(name: string) {
      return normalized.get(name.toLowerCase()) ?? null;
    },
    entries() {
      return normalized.entries();
    },
  } as Headers;
}

describe("proxyProtectedVideoStream", () => {
  const jar = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

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

  it("forwards Range to upstream with Authorization", async () => {
    const { proxyProtectedVideoStream } = await import(
      "@/app/api/_lib/video-stream-proxy"
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(streamFrom([1, 2, 3, 4]), {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Range": "bytes 0-3/10",
          "Content-Length": "4",
          "Content-Type": "video/mp4",
        },
      }),
    );

    await proxyProtectedVideoStream({
      request: {
        headers: requestHeaders({
          Authorization: "Bearer access-token",
          Range: "bytes=0-3",
        }),
      },
      upstreamPath: UPSTREAM_PATH,
      fallbackDetail: "Video request failed.",
    });

    expect(fetch).toHaveBeenCalledWith(
      `https://api.example.com${UPSTREAM_PATH}`,
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer access-token",
          Range: "bytes=0-3",
        },
      }),
    );
  });

  it("returns upstream 206 with preserved range headers and streamed body", async () => {
    const { proxyProtectedVideoStream } = await import(
      "@/app/api/_lib/video-stream-proxy"
    );
    const upstream = new Response(streamFrom([0, 1, 2, 3]), {
      status: 206,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": "bytes 0-3/10",
        "Content-Length": "4",
        "Content-Type": "video/mp4",
        "Cache-Control": "private, no-store",
      },
    });
    const arrayBufferSpy = vi.spyOn(upstream, "arrayBuffer");
    const blobSpy = vi.spyOn(upstream, "blob");
    vi.mocked(fetch).mockResolvedValue(upstream);

    const response = await proxyProtectedVideoStream({
      request: { headers: new Headers({ Authorization: "Bearer access-token" }) },
      upstreamPath: UPSTREAM_PATH,
      fallbackDetail: "Video request failed.",
    });

    expect(response.status).toBe(206);
    expect(response.body).not.toBeNull();
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Range")).toBe("bytes 0-3/10");
    expect(response.headers.get("Content-Length")).toBe("4");
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0, 1, 2, 3]),
    );
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(blobSpy).not.toHaveBeenCalled();
  });

  it("sets no-store headers for private streams when the access token is still valid", async () => {
    const { proxyProtectedVideoStream } = await import(
      "@/app/api/_lib/video-stream-proxy"
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(streamFrom([1, 2]), {
        status: 200,
        headers: {
          "Content-Length": "2",
          "Content-Type": "video/mp4",
        },
      }),
    );

    const response = await proxyProtectedVideoStream({
      request: { headers: new Headers({ Authorization: "Bearer access-token" }) },
      upstreamPath: UPSTREAM_PATH,
      fallbackDetail: "Video request failed.",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(sessionStateMock.setNoStoreHeaders).toHaveBeenCalledWith(response);
    expect(response.headers.has("X-Access-Token")).toBe(false);
  });

  it("preserves Content-Disposition for attachment downloads", async () => {
    const { proxyProtectedVideoStream } = await import(
      "@/app/api/_lib/video-stream-proxy"
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(streamFrom([1]), {
        status: 200,
        headers: {
          "Content-Disposition": 'attachment; filename="Trip_recap.mp4"',
          "Content-Length": "1",
          "Content-Type": "video/mp4",
        },
      }),
    );

    const response = await proxyProtectedVideoStream({
      request: { headers: new Headers({ Authorization: "Bearer access-token" }) },
      upstreamPath: UPSTREAM_PATH.replace("/video", "/download"),
      fallbackDetail: "Video download failed.",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Trip_recap.mp4"',
    );
  });

  it("returns upstream 416 with preserved range headers as a stream response", async () => {
    const { proxyProtectedVideoStream } = await import(
      "@/app/api/_lib/video-stream-proxy"
    );
    const upstream = new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": "bytes */10",
        "Content-Length": "0",
        "Content-Type": "video/mp4",
      },
    });
    const jsonSpy = vi.spyOn(upstream, "json");
    const textSpy = vi.spyOn(upstream, "text");
    vi.mocked(fetch).mockResolvedValue(upstream);

    const response = await proxyProtectedVideoStream({
      request: { headers: new Headers({ Authorization: "Bearer access-token" }) },
      upstreamPath: UPSTREAM_PATH,
      fallbackDetail: "Video request failed.",
    });

    expect(response.status).toBe(416);
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Range")).toBe("bytes */10");
    expect(response.headers.get("Content-Length")).toBe("0");
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(await response.text()).toBe("");
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(textSpy).not.toHaveBeenCalled();
  });

  it("retries with a refreshed token after upstream 401", async () => {
    const { proxyProtectedVideoStream } = await import(
      "@/app/api/_lib/video-stream-proxy"
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
        new Response(streamFrom([9]), {
          status: 200,
          headers: {
            "Content-Length": "1",
            "Content-Type": "video/mp4",
          },
        }),
      );

    const response = await proxyProtectedVideoStream({
      request: { headers: new Headers({ Authorization: "Bearer stale-access-token" }) },
      upstreamPath: UPSTREAM_PATH,
      fallbackDetail: "Video request failed.",
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `https://api.example.com${UPSTREAM_PATH}`,
      expect.objectContaining({
        headers: { Authorization: "Bearer fresh-access-token" },
      }),
    );
    expect(sessionStateMock.setRefreshToken).toHaveBeenCalledWith(jar, "fresh-refresh-token");
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Access-Token")).toBe("fresh-access-token");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it.each([
    [404, { detail: "Memory video not found.", error_code: "MEMORY_NOT_FOUND" }],
    [409, { detail: "Memory video is not ready.", error_code: "MEMORY_NOT_READY" }],
  ])("returns JSON errors for upstream %s", async (status, payload) => {
    const { proxyProtectedVideoStream } = await import(
      "@/app/api/_lib/video-stream-proxy"
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "7",
        },
      }),
    );

    const response = await proxyProtectedVideoStream({
      request: { headers: new Headers({ Authorization: "Bearer access-token" }) },
      upstreamPath: UPSTREAM_PATH,
      fallbackDetail: "Video request failed.",
    });

    expect(response.status).toBe(status);
    expect(response.headers.get("Retry-After")).toBe("7");
    await expect(response.json()).resolves.toEqual(payload);
  });
});

describe("proxyPublicVideoStream", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards Range to the public upstream without auth or cookies", async () => {
    const { proxyPublicVideoStream } = await import(
      "@/app/api/_lib/video-stream-proxy"
    );
    const upstream = new Response(streamFrom([4, 5]), {
      status: 206,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": "bytes 4-5/10",
        "Content-Length": "2",
        "Content-Type": "video/mp4",
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=300",
      },
    });
    const arrayBufferSpy = vi.spyOn(upstream, "arrayBuffer");
    const blobSpy = vi.spyOn(upstream, "blob");
    vi.mocked(fetch).mockResolvedValue(upstream);

    const response = await proxyPublicVideoStream({
      request: {
        headers: requestHeaders({
          Authorization: "Bearer should-not-forward",
          Range: "bytes=4-5",
        }),
      },
      upstreamPath: "/api/public/memories/public-slug/video",
      fallbackDetail: "Public memory video request failed.",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/public/memories/public-slug/video",
      {
        method: "GET",
        headers: { Range: "bytes=4-5" },
      },
    );
    expect(nextHeadersMock.cookies).not.toHaveBeenCalled();
    expect(response.status).toBe(206);
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Range")).toBe("bytes 4-5/10");
    expect(response.headers.get("Content-Length")).toBe("2");
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Disposition")).toBe("inline");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(sessionStateMock.setNoStoreHeaders).not.toHaveBeenCalled();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([4, 5]),
    );
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(blobSpy).not.toHaveBeenCalled();
  });
});
