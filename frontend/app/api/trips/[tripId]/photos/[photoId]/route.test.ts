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

const TRIP_ID = "11111111-1111-1111-1111-111111111111";
const PHOTO_ID = "22222222-2222-4222-8222-222222222222";

describe("BFF /api/trips/[tripId]/photos/[photoId]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("forwards DELETE to Django and preserves no-content status", async () => {
    const { DELETE } = await import("@/app/api/trips/[tripId]/photos/[photoId]/route");
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data: null,
      status: 204,
    });

    const response = await DELETE(
      { headers: new Headers({ Authorization: "Bearer access-token" }) } as never,
      { params: Promise.resolve({ tripId: TRIP_ID, photoId: PHOTO_ID }) },
    );

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalledWith({
      path: `/api/trips/${TRIP_ID}/photos/${PHOTO_ID}`,
      method: "DELETE",
      authorization: "Bearer access-token",
    });
    expect(response.status).toBe(204);
  });
});
