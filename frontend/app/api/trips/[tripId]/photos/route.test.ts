import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const nextHeadersMock = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

const refreshMock = vi.hoisted(() => ({
  refreshWithSingleFlight: vi.fn(),
}));

const sessionStateMock = vi.hoisted(() => ({
  REFRESH_COOKIE_NAME: "refresh_token",
  handleRefreshFailure: vi.fn(),
  setNoStoreHeaders: vi.fn((response: Response) => response),
  setRefreshToken: vi.fn(),
}));

vi.mock("@/app/api/_lib/protected-upstream", () => protectedUpstreamMock);
vi.mock("next/headers", () => nextHeadersMock);
vi.mock("@/app/api/auth/_lib/refresh", () => refreshMock);
vi.mock("@/app/api/auth/_lib/session-state", () => sessionStateMock);
vi.mock("@/shared/http/config", () => ({
  API_BASE_URL: "https://api.example.com",
}));

const TRIP_ID = "11111111-1111-1111-1111-111111111111";

function buildGetRequest(query = "") {
  return {
    headers: new Headers({ Authorization: "Bearer access-token" }),
    nextUrl: new URL(`http://localhost/api/trips/${TRIP_ID}/photos${query}`),
  };
}

function buildPostRequest(formData: FormData) {
  return {
    headers: new Headers({ Authorization: "Bearer access-token" }),
    formData: vi.fn().mockResolvedValue(formData),
  };
}

function buildPostRequestWithHeaders(headers: Headers, formData = new FormData()) {
  return {
    headers,
    formData: vi.fn().mockResolvedValue(formData),
  };
}

describe("BFF /api/trips/[tripId]/photos", () => {
  const jar = { get: vi.fn() };

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    nextHeadersMock.cookies.mockResolvedValue(jar);
    sessionStateMock.handleRefreshFailure.mockReturnValue(null);
    jar.get.mockReturnValue({ value: "refresh-cookie" });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards GET list with cursor query", async () => {
    const { GET } = await import("@/app/api/trips/[tripId]/photos/route");
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      data: { next: null, previous: null, results: [] },
      status: 200,
    });

    const response = await GET(buildGetRequest("?cursor=abc") as never, {
      params: Promise.resolve({ tripId: TRIP_ID }),
    });

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/api/trips/${TRIP_ID}/photos`,
        method: "GET",
        query: "cursor=abc",
        authorization: "Bearer access-token",
      }),
    );
    expect(response.status).toBe(200);
  });

  it("forwards repeated files as multipart to Django", async () => {
    const { POST } = await import("@/app/api/trips/[tripId]/photos/route");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ photos: [{ id: "photo-1" }] }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const formData = new FormData();
    formData.append("files", new File(["one"], "one.jpg", { type: "image/jpeg" }));
    formData.append("files", new File(["two"], "two.png", { type: "image/png" }));

    const response = await POST(buildPostRequest(formData) as never, {
      params: Promise.resolve({ tripId: TRIP_ID }),
    });

    expect(fetch).toHaveBeenCalledWith(
      `https://api.example.com/api/trips/${TRIP_ID}/photos`,
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer access-token" },
        body: expect.any(FormData),
      }),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ photos: [{ id: "photo-1" }] });
  });

  it("rejects oversized multipart bodies from Content-Length before parsing form data", async () => {
    const { POST } = await import("@/app/api/trips/[tripId]/photos/route");
    const request = buildPostRequestWithHeaders(
      new Headers({
        Authorization: "Bearer access-token",
        "Content-Length": String(202 * 1024 * 1024),
      }),
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ tripId: TRIP_ID }),
    });

    expect(request.formData).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      detail: "Upload body is too large. Upload at most 20 photos of 10 MiB each.",
      error_code: "UPLOAD_TOO_LARGE",
    });
  });

  it("rejects no-file uploads before forwarding", async () => {
    const { POST } = await import("@/app/api/trips/[tripId]/photos/route");

    const response = await POST(buildPostRequest(new FormData()) as never, {
      params: Promise.resolve({ tripId: TRIP_ID }),
    });

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      detail: "Select at least one photo to upload.",
      error_code: "NO_FILES",
    });
  });

  it("rejects oversized files before forwarding", async () => {
    const { POST } = await import("@/app/api/trips/[tripId]/photos/route");
    const formData = new FormData();
    formData.append(
      "files",
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.jpg", {
        type: "image/jpeg",
      }),
    );

    const response = await POST(buildPostRequest(formData) as never, {
      params: Promise.resolve({ tripId: TRIP_ID }),
    });

    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      detail: "Photo exceeds 10 MiB limit.",
      error_code: "PHOTO_TOO_LARGE",
    });
  });

  it("rejects SVG and unsupported files before forwarding", async () => {
    const { POST } = await import("@/app/api/trips/[tripId]/photos/route");
    const formData = new FormData();
    formData.append("files", new File(["<svg/>"], "bad.svg", { type: "image/svg+xml" }));

    const response = await POST(buildPostRequest(formData) as never, {
      params: Promise.resolve({ tripId: TRIP_ID }),
    });

    expect(response.status).toBe(415);
    expect(fetch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      detail: "Unsupported image format. Use JPEG, PNG, or WebP.",
      error_code: "UNSUPPORTED_IMAGE_TYPE",
    });
  });

  it("rejects HEIC with a clear unsupported-format payload", async () => {
    const { POST } = await import("@/app/api/trips/[tripId]/photos/route");
    const formData = new FormData();
    formData.append("files", new File(["heic"], "photo.heic", { type: "image/heic" }));

    const response = await POST(buildPostRequest(formData) as never, {
      params: Promise.resolve({ tripId: TRIP_ID }),
    });

    expect(response.status).toBe(415);
    expect(fetch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      detail: "HEIC images are not supported yet. Convert to JPEG, PNG, or WebP.",
      error_code: "HEIC_UNSUPPORTED",
    });
  });

  it("allows empty or generic file MIME types so backend magic-byte validation remains authoritative", async () => {
    const { POST } = await import("@/app/api/trips/[tripId]/photos/route");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ photos: [{ id: "photo-1" }] }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const formData = new FormData();
    formData.append("files", new File(["jpeg-bytes"], "photo.jpg", { type: "" }));
    formData.append(
      "files",
      new File(["webp-bytes"], "photo.webp", { type: "application/octet-stream" }),
    );

    const response = await POST(buildPostRequest(formData) as never, {
      params: Promise.resolve({ tripId: TRIP_ID }),
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(201);
  });
});
