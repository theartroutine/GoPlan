import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/http/config", () => ({
  API_BASE_URL: "https://api.example.com",
}));

describe("BFF /api/share/memories/[slug]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the backend public metadata endpoint without auth", async () => {
    const { GET } = await import("@/app/api/share/memories/[slug]/route");
    const payload = {
      title: "Da Nang recap",
      poster_url: "/api/public/memories/public-slug/poster",
      video_url: "/api/public/memories/public-slug/video",
      duration_seconds: 42,
      source_photo_count: 7,
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await GET({} as never, {
      params: Promise.resolve({ slug: "public/slug" }),
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/public/memories/public%2Fslug",
      {
        method: "GET",
        cache: "no-store",
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      title: "Da Nang recap",
      poster_url: "/api/share/memories/public%2Fslug/poster",
      video_url: "/api/share/memories/public%2Fslug/video",
      duration_seconds: 42,
      source_photo_count: 7,
    });
  });

  it("rejects invalid successful upstream metadata instead of leaking it", async () => {
    const { GET } = await import("@/app/api/share/memories/[slug]/route");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ title: "Da Nang recap" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await GET({} as never, {
      params: Promise.resolve({ slug: "public-slug" }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      detail: "Public memory response was invalid.",
    });
  });

  it("returns upstream JSON errors and Retry-After", async () => {
    const { GET } = await import("@/app/api/share/memories/[slug]/route");
    const payload = {
      detail: "Memory video not found.",
      error_code: "MEMORY_NOT_FOUND",
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "9",
        },
      }),
    );

    const response = await GET({} as never, {
      params: Promise.resolve({ slug: "missing-share" }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("Retry-After")).toBe("9");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(payload);
  });

  it("returns 503 when the backend public metadata service is unavailable", async () => {
    const { GET } = await import("@/app/api/share/memories/[slug]/route");
    vi.mocked(fetch).mockRejectedValue(new TypeError("network failed"));

    const response = await GET({} as never, {
      params: Promise.resolve({ slug: "public-slug" }),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      detail: "Public memory service unavailable.",
    });
  });
});
