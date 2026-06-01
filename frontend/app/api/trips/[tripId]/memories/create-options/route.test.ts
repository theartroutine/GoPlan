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

describe("BFF /api/trips/[tripId]/memories/create-options", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("forwards GET to the encoded upstream create options route", async () => {
    const { GET } = await import("@/app/api/trips/[tripId]/memories/create-options/route");
    const data = { photo_limits: { min: 5, max: 50, auto_pick: 20 } };
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
      path: "/api/trips/trip%2F1/memories/create-options",
      method: "GET",
      authorization: "Bearer access-token",
    });
    await expect(response.json()).resolves.toEqual(data);
  });
});
