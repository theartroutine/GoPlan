import { beforeEach, describe, expect, it, vi } from "vitest";

const upstreamMock = vi.hoisted(() => ({
  callAuthUpstream: vi.fn(),
}));

vi.mock("@/app/api/auth/_lib/upstream", async () => {
  return {
    asObject(value: unknown) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return null;
      }
      return value as Record<string, unknown>;
    },
    callAuthUpstream: upstreamMock.callAuthUpstream,
    extractDetail(value: unknown, fallback: string) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return fallback;
      }
      const detail = (value as Record<string, unknown>).detail;
      return typeof detail === "string" && detail.length > 0 ? detail : fallback;
    },
    getString(value: unknown, key: string) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return null;
      }
      const candidate = (value as Record<string, unknown>)[key];
      return typeof candidate === "string" ? candidate : null;
    },
    normalizeErrorPayload(value: unknown, fallback: string) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
      return { detail: fallback };
    },
  };
});

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not require or forward an email echo from the auth service", async () => {
    const { POST } = await import("@/app/api/auth/register/route");

    upstreamMock.callAuthUpstream.mockResolvedValue({
      kind: "response",
      ok: true,
      status: 202,
      data: { detail: "If registration can continue, check your email." },
    });

    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "StrongPass#2026",
        }),
      }) as never,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      detail: "If registration can continue, check your email.",
    });
  });
});
