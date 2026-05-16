import { beforeEach, describe, expect, it, vi } from "vitest";

const nextHeadersMock = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

const protectedUpstreamMock = vi.hoisted(() => ({
  protectedUpstreamCall: vi.fn(),
}));

const sessionStateMock = vi.hoisted(() => ({
  clearRefreshAuthErrorMarker: vi.fn(),
  setNoStoreHeaders: vi.fn((response: Response) => {
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  }),
  setRefreshToken: vi.fn(),
}));

vi.mock("next/headers", () => nextHeadersMock);
vi.mock("@/app/api/_lib/protected-upstream", () => protectedUpstreamMock);
vi.mock("@/app/api/auth/_lib/session-state", () => sessionStateMock);
vi.mock("@/app/api/auth/_lib/upstream", () => ({
  asObject(value: unknown) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  },
  extractUserPayload(user: Record<string, unknown> | null) {
    if (!user) return null;
    const id = typeof user.id === "string" ? user.id : null;
    const email = typeof user.email === "string" ? user.email : null;
    if (!id || !email) return null;
    return user;
  },
  getString(value: unknown, key: string) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === "string" ? candidate : null;
  },
}));

import { POST } from "@/app/api/auth/password/change/route";

const USER_PAYLOAD = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "owner@example.com",
  first_name: "Quang",
  last_name: "Minh",
  display_name: "Quang Minh",
  identify_name: "quangminh",
  identify_code: "ABC123",
  identify_tag: "quangminh#ABC123",
  avatar_url: "/media/avatars/a.webp",
  email_verified: true,
  is_profile_completed: true,
  requires_profile_setup: false,
};

describe("POST /api/auth/password/change", () => {
  const jar = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    nextHeadersMock.cookies.mockResolvedValue(jar);
  });

  it("sets the rotated refresh cookie and returns the fresh access token", async () => {
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        user: USER_PAYLOAD,
        tokens: {
          access: "fresh-access-token",
          refresh: "fresh-refresh-token",
          token_type: "Bearer",
        },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/auth/password/change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer old-access-token",
        },
        body: JSON.stringify({
          current_password: "OldValidPw123!",
          new_password: "BrandNewPw456!",
        }),
      }) as never,
    );

    expect(protectedUpstreamMock.protectedUpstreamCall).toHaveBeenCalledWith({
      path: "/api/auth/password/change",
      method: "POST",
      body: JSON.stringify({
        current_password: "OldValidPw123!",
        new_password: "BrandNewPw456!",
      }),
      authorization: "Bearer old-access-token",
    });
    expect(sessionStateMock.clearRefreshAuthErrorMarker).toHaveBeenCalledWith(jar);
    expect(sessionStateMock.setRefreshToken).toHaveBeenCalledWith(
      jar,
      "fresh-refresh-token",
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate, private",
    );
    await expect(response.json()).resolves.toEqual({
      user: USER_PAYLOAD,
      access_token: "fresh-access-token",
    });
  });

  it("does not rotate the refresh cookie when auth service payload is incomplete", async () => {
    protectedUpstreamMock.protectedUpstreamCall.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        user: USER_PAYLOAD,
        tokens: { access: "fresh-access-token" },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/auth/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: "OldValidPw123!",
          new_password: "BrandNewPw456!",
        }),
      }) as never,
    );

    expect(response.status).toBe(502);
    expect(sessionStateMock.setRefreshToken).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      detail: "Invalid response from auth service.",
    });
  });
});
