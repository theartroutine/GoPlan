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

function buildGetRequest(url: string) {
  return {
    headers: new Headers({ Authorization: "Bearer access-token" }),
    nextUrl: new URL(url),
  };
}

describe("BFF /api/trips/[tripId]/memories/status", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("forwards repeated ids to the encoded upstream status route", async () => {
    const { GET } = await import("@/app/api/trips/[tripId]/memories/status/route");
    const data = { results: [{ id: "memory_1", status: "rendering" }] };
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data,
      status: 200,
      refreshedAccessToken: "fresh-token",
    });

    const response = await GET(
      buildGetRequest(
        "http://localhost/api/trips/trip%201/memories/status?ids=memory_1&ids=memory_2",
      ) as never,
      { params: Promise.resolve({ tripId: "trip 1" }) },
    );

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalledWith({
      path: "/api/trips/trip%201/memories/status",
      method: "GET",
      query: "ids=memory_1&ids=memory_2",
      authorization: "Bearer access-token",
    });
    expect(response.headers.get("X-Access-Token")).toBe("fresh-token");
    await expect(response.json()).resolves.toEqual(data);
  });
});
