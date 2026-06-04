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

const REQUEST = {
  headers: new Headers({ Authorization: "Bearer access-token" }),
};

describe("BFF /api/trips/[tripId]/memories/[memoryId]/share-link", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("forwards POST enable share link", async () => {
    const { POST } = await import(
      "@/app/api/trips/[tripId]/memories/[memoryId]/share-link/route"
    );
    const data = { share: { enabled: true, url: "https://goplan.test/m/share" } };
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data,
      status: 200,
    });

    const response = await POST(REQUEST as never, {
      params: Promise.resolve({ tripId: "trip 1", memoryId: "memory 1" }),
    });

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalledWith({
      path: "/api/trips/trip%201/memories/memory%201/share-link",
      method: "POST",
      authorization: "Bearer access-token",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(data);
  });

  it("forwards DELETE disable share link", async () => {
    const { DELETE } = await import(
      "@/app/api/trips/[tripId]/memories/[memoryId]/share-link/route"
    );
    const data = { share: { enabled: false, url: null } };
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data,
      status: 200,
    });

    const response = await DELETE(REQUEST as never, {
      params: Promise.resolve({ tripId: "trip 1", memoryId: "memory 1" }),
    });

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalledWith({
      path: "/api/trips/trip%201/memories/memory%201/share-link",
      method: "DELETE",
      authorization: "Bearer access-token",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(data);
  });
});
