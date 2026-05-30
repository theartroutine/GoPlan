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

function buildGetRequest(url: string) {
  return {
    headers: new Headers({ Authorization: "Bearer access-token" }),
    nextUrl: new URL(url),
  };
}

function buildJsonRequest(payload: unknown) {
  return {
    headers: new Headers({ Authorization: "Bearer access-token" }),
    json: vi.fn().mockResolvedValue(payload),
  };
}

describe("BFF /api/trips/[tripId]/memories", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("forwards GET list with cursor, page size, and future query params", async () => {
    const { GET } = await import("@/app/api/trips/[tripId]/memories/route");
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data: { next: null, previous: null, results: [] },
      status: 200,
      refreshedAccessToken: "fresh-token",
    });

    const response = await GET(
      buildGetRequest(
        "http://localhost/api/trips/trip%201/memories?cursor=abc&page_size=20&status=ready",
      ) as never,
      { params: Promise.resolve({ tripId: "trip 1" }) },
    );

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalledWith({
      path: "/api/trips/trip%201/memories",
      method: "GET",
      query: "cursor=abc&page_size=20&status=ready",
      authorization: "Bearer access-token",
    });
    expect(protectedUpstreamMock.buildProtectedResponse).toHaveBeenCalledWith(
      { next: null, previous: null, results: [] },
      "fresh-token",
      200,
    );
    expect(response.headers.get("X-Access-Token")).toBe("fresh-token");
  });

  it("forwards POST create JSON to the encoded upstream path", async () => {
    const { POST } = await import("@/app/api/trips/[tripId]/memories/route");
    const payload = {
      source_mode: "auto",
      title: "Da Nang recap",
    };
    const data = { memory: { id: "memory_1", status: "queued" } };
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data,
      status: 201,
    });

    const response = await POST(buildJsonRequest(payload) as never, {
      params: Promise.resolve({ tripId: "trip/1" }),
    });

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalledWith({
      path: "/api/trips/trip%2F1/memories",
      method: "POST",
      body: JSON.stringify(payload),
      authorization: "Bearer access-token",
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(data);
  });

  it("returns 400 when POST JSON parsing fails", async () => {
    const { POST } = await import("@/app/api/trips/[tripId]/memories/route");
    const request = {
      headers: new Headers({ Authorization: "Bearer access-token" }),
      json: vi.fn().mockRejectedValue(new SyntaxError("bad json")),
    };

    const response = await POST(request as never, {
      params: Promise.resolve({ tripId: "trip_1" }),
    });

    expect(protectedUpstreamMock.protectedUpstreamCall).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: "Invalid request body.",
    });
  });
});
