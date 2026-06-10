import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upstreamMock = vi.hoisted(() => ({
  callAuthUpstream: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: async () => new Headers(),
}));

vi.mock("@/app/api/auth/_lib/session-state", () => ({
  clearRefreshAuthErrorMarker: vi.fn(),
  setRefreshToken: vi.fn(),
}));

vi.mock("@/app/api/auth/_lib/upstream", () => {
  function asObject(value: unknown) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
  function getString(value: unknown, key: string) {
    const objectValue = asObject(value);
    const candidate = objectValue?.[key];
    return typeof candidate === "string" ? candidate : null;
  }
  function getBoolean(value: unknown, key: string) {
    const objectValue = asObject(value);
    const candidate = objectValue?.[key];
    return typeof candidate === "boolean" ? candidate : null;
  }
  return {
    asObject,
    getString,
    getBoolean,
    callAuthUpstream: upstreamMock.callAuthUpstream,
    extractUserPayload(user: Record<string, unknown> | null) {
      return user;
    },
  };
});

const PUBLIC_APP_BASE_URL = "https://app.example.com";
// Behind a tunnel/reverse proxy the Host header can be the internal service
// address, so request.url must never be used as the redirect base.
const INTERNAL_REQUEST_URL = "http://127.0.0.1:3000/api/auth/verify-email";

function buildRequest(query: string) {
  const url = new URL(`${INTERNAL_REQUEST_URL}${query}`);
  return {
    url: url.toString(),
    nextUrl: url,
    headers: new Headers(),
  } as never;
}

describe("GET /api/auth/verify-email", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", PUBLIC_APP_BASE_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects to the public app origin after verification, not the request origin", async () => {
    const { GET } = await import("@/app/api/auth/verify-email/route");

    upstreamMock.callAuthUpstream.mockResolvedValue({
      kind: "response",
      ok: true,
      status: 200,
      data: {
        user: {
          id: "user-1",
          email: "owner@example.com",
          is_profile_completed: false,
          requires_profile_setup: true,
        },
        tokens: { access: "access-token", refresh: "refresh-token" },
      },
    });

    const response = await GET(buildRequest("?token=valid-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${PUBLIC_APP_BASE_URL}/setup-profile?verified=true`,
    );
  });

  it("redirects invalid tokens to the public app origin login page", async () => {
    const { GET } = await import("@/app/api/auth/verify-email/route");

    const response = await GET(buildRequest(""));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${PUBLIC_APP_BASE_URL}/login?verify_error=invalid`,
    );
  });
});
