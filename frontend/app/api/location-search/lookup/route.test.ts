import { beforeEach, describe, expect, it, vi } from "vitest";

const protectedUpstreamMock = vi.hoisted(() => ({
  buildProtectedResponse: vi.fn(
    (data: unknown, refreshedAccessToken?: string, status = 200) => {
      const response = Response.json(data, { status });
      if (refreshedAccessToken) {
        response.headers.set("X-Access-Token", refreshedAccessToken);
      }
      return response;
    },
  ),
  protectedUpstreamCall: vi.fn(),
}));

vi.mock("@/app/api/_lib/protected-upstream", () => protectedUpstreamMock);

describe("GET /api/location-search/lookup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    process.env.ENABLE_HERE_LOCATION_SEARCH = "true";
    process.env.HERE_API_KEY = "demo-key";
    process.env.NODE_ENV = "test";
  });

  it("rejects requests when session validation fails", async () => {
    const { GET } = await import("@/app/api/location-search/lookup/route");

    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: false,
      response: Response.json({ detail: "Not authenticated." }, { status: 401 }),
    });

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "here:1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await GET({
      headers: new Headers(),
      nextUrl: new URL("http://localhost/api/location-search/lookup?id=here:1"),
    } as never);

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it("rejects overlong provider ids before calling HERE", async () => {
    const { GET } = await import("@/app/api/location-search/lookup/route");

    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data: { user: { id: "user-1" } },
      status: 200,
    });

    const response = await GET({
      headers: new Headers(),
      nextUrl: new URL(
        `http://localhost/api/location-search/lookup?id=${"a".repeat(257)}`,
      ),
    } as never);

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses an abortable HERE request on successful lookup", async () => {
    const { GET } = await import("@/app/api/location-search/lookup/route");

    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data: { user: { id: "user-1" } },
      status: 200,
      refreshedAccessToken: "fresh-access-token",
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "here:1",
          title: "Da Nang",
          address: { label: "Da Nang, Vietnam", countryCode: "VNM" },
          position: { lat: 16.047079, lng: 108.20623 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const response = await GET({
      headers: new Headers(),
      nextUrl: new URL("http://localhost/api/location-search/lookup?id=here:1"),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Access-Token")).toBe("fresh-access-token");
    expect(vi.mocked(fetch).mock.calls[0][1]).toEqual(
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
