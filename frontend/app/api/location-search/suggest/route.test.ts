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

describe("GET /api/location-search/suggest", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    process.env.ENABLE_HERE_LOCATION_SEARCH = "true";
    process.env.HERE_API_KEY = "demo-key";
    process.env.NODE_ENV = "test";
    protectedUpstreamMock.buildProtectedResponse.mockImplementation(
      (data: unknown, refreshedAccessToken?: string, status = 200) => {
        const response = Response.json(data, { status });
        if (refreshedAccessToken) {
          response.headers.set("X-Access-Token", refreshedAccessToken);
        }
        return response;
      },
    );
  });

  it("rejects requests when session validation fails", async () => {
    const { GET } = await import("@/app/api/location-search/suggest/route");

    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: false,
      response: Response.json({ detail: "Not authenticated." }, { status: 401 }),
    });

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await GET({
      headers: new Headers(),
      nextUrl: new URL("http://localhost/api/location-search/suggest?q=ha"),
    } as never);

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it("preserves a refreshed access token on successful responses", async () => {
    const { GET } = await import("@/app/api/location-search/suggest/route");

    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data: { user: { id: "user-1" } },
      refreshedAccessToken: "fresh-access-token",
    });

    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "here:1",
              title: "Da Nang",
              resultType: "locality",
              address: { label: "Da Nang, Vietnam" },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const response = await GET({
      headers: new Headers(),
      nextUrl: new URL("http://localhost/api/location-search/suggest?q=da"),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Access-Token")).toBe("fresh-access-token");
    await expect(response.json()).resolves.toEqual({
      suggestions: [
        {
          provider: "here",
          provider_id: "here:1",
          subtitle: "Vietnam",
          title: "Da Nang",
        },
      ],
    });
  });
});
