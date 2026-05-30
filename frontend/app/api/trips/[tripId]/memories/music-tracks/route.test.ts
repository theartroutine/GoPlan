import { beforeEach, describe, expect, it, vi } from "vitest";

const protectedUpstreamMock = vi.hoisted(() => ({
  buildProtectedResponse: vi.fn(
    (data: unknown, refreshedAccessToken?: string, status = 200) => {
      const response = Response.json(data, { status });
      if (refreshedAccessToken) response.headers.set("X-Access-Token", refreshedAccessToken);
      return response;
    },
  ),
  protectedUpstreamCall: vi.fn(),
}));

vi.mock("@/app/api/_lib/protected-upstream", () => protectedUpstreamMock);

describe("BFF /api/trips/[tripId]/memories/music-tracks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("forwards GET music catalog to Django", async () => {
    const { GET } = await import(
      "@/app/api/trips/[tripId]/memories/music-tracks/route"
    );
    const data = { tracks: [] };
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data,
      status: 200,
    });

    const response = await GET(
      { headers: new Headers({ Authorization: "Bearer access-token" }) } as never,
      { params: Promise.resolve({ tripId: "trip/1" }) },
    );

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalledWith({
      path: "/api/trips/trip%2F1/memories/music-tracks",
      method: "GET",
      authorization: "Bearer access-token",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(data);
  });
});
