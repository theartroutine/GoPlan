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
});
