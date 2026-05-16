import { beforeEach, describe, expect, it, vi } from "vitest";

const protectedUpstreamMock = vi.hoisted(() => ({
  buildProtectedResponse: vi.fn((data: unknown, refreshedAccessToken?: string) => {
    const response = Response.json(data);
    if (refreshedAccessToken) {
      response.headers.set("X-Access-Token", refreshedAccessToken);
    }
    return response;
  }),
  protectedUpstreamCall: vi.fn(),
}));

const upstreamMock = vi.hoisted(() => ({
  asObject(value: unknown) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  },
  callAuthUpstream: vi.fn(),
  extractUserPayload(user: Record<string, unknown> | null) {
    if (!user) return null;
    const id = typeof user.id === "string" ? user.id : null;
    const email = typeof user.email === "string" ? user.email : null;
    if (!id || !email) return null;
    return user;
  },
  normalizeErrorPayload: vi.fn((data: unknown) => data),
}));

vi.mock("@/app/api/_lib/protected-upstream", () => protectedUpstreamMock);
vi.mock("@/app/api/auth/_lib/upstream", () => upstreamMock);

import { POST } from "@/app/api/auth/profile/setup/route";

const USER_PAYLOAD = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "owner@example.com",
  first_name: "Quang",
  last_name: "Minh",
  display_name: "Quang Minh",
  identify_name: "quangminh",
  identify_code: "ABC123",
  identify_tag: "quangminh#ABC123",
  avatar_url: null,
  email_verified: true,
  is_profile_completed: true,
  requires_profile_setup: false,
};

describe("POST /api/auth/profile/setup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses protected upstream refresh fallback and returns refreshed access token", async () => {
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      status: 200,
      refreshedAccessToken: "fresh-access-token",
      data: { user: USER_PAYLOAD },
    });

    const body = {
      first_name: "Quang",
      last_name: "Minh",
      identify_name: "quangminh",
    };
    const response = await POST(
      new Request("http://localhost/api/auth/profile/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }) as never,
    );

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalledWith({
      path: "/api/auth/profile/setup",
      method: "POST",
      body: JSON.stringify(body),
      authorization: null,
    });
    expect(response.headers.get("X-Access-Token")).toBe("fresh-access-token");
    await expect(response.json()).resolves.toEqual({ user: USER_PAYLOAD });
  });
});
