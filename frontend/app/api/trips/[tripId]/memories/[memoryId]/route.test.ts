import { beforeEach, describe, expect, it, vi } from "vitest";

const protectedUpstreamMock = vi.hoisted(() => ({
  buildProtectedResponse: vi.fn(
    (data: unknown, refreshedAccessToken?: string, status = 200) => {
      const response =
        status === 204 ? new Response(null, { status }) : Response.json(data, { status });
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

describe("BFF /api/trips/[tripId]/memories/[memoryId]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("forwards GET detail to Django with encoded params", async () => {
    const { GET } = await import("@/app/api/trips/[tripId]/memories/[memoryId]/route");
    const data = { memory: { id: "memory/1", status: "ready" } };
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data,
      status: 200,
    });

    const response = await GET(REQUEST as never, {
      params: Promise.resolve({ tripId: "trip/1", memoryId: "memory/1" }),
    });

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalledWith({
      path: "/api/trips/trip%2F1/memories/memory%2F1",
      method: "GET",
      authorization: "Bearer access-token",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(data);
  });

  it("forwards PATCH update JSON to Django", async () => {
    const { PATCH } = await import("@/app/api/trips/[tripId]/memories/[memoryId]/route");
    const payload = { title: "Updated recap" };
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data: { memory: { id: "memory_1", title: "Updated recap" } },
      status: 200,
    });

    const response = await PATCH(
      {
        headers: new Headers({ Authorization: "Bearer access-token" }),
        json: vi.fn().mockResolvedValue(payload),
      } as never,
      { params: Promise.resolve({ tripId: "trip_1", memoryId: "memory_1" }) },
    );

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalledWith({
      path: "/api/trips/trip_1/memories/memory_1",
      method: "PATCH",
      body: JSON.stringify(payload),
      authorization: "Bearer access-token",
    });
    expect(response.status).toBe(200);
  });

  it("returns 400 when PATCH JSON parsing fails", async () => {
    const { PATCH } = await import("@/app/api/trips/[tripId]/memories/[memoryId]/route");

    const response = await PATCH(
      {
        headers: new Headers({ Authorization: "Bearer access-token" }),
        json: vi.fn().mockRejectedValue(new SyntaxError("bad json")),
      } as never,
      { params: Promise.resolve({ tripId: "trip_1", memoryId: "memory_1" }) },
    );

    expect(protectedUpstreamMock.protectedUpstreamCall).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: "Invalid request body.",
    });
  });

  it("forwards DELETE and preserves no-content status", async () => {
    const { DELETE } = await import("@/app/api/trips/[tripId]/memories/[memoryId]/route");
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data: null,
      status: 204,
    });

    const response = await DELETE(REQUEST as never, {
      params: Promise.resolve({ tripId: "trip_1", memoryId: "memory_1" }),
    });

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalledWith({
      path: "/api/trips/trip_1/memories/memory_1",
      method: "DELETE",
      authorization: "Bearer access-token",
    });
    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });
});
