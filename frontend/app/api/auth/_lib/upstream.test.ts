import { beforeEach, describe, expect, it, vi } from "vitest";

import { callAuthUpstream } from "@/app/api/auth/_lib/upstream";

vi.mock("@/shared/http/config", () => ({
  API_BASE_URL: "https://api.example.com",
}));

describe("callAuthUpstream", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    delete process.env.GOPLAN_INTERNAL_PROXY_SECRET;
  });

  it("does not reflect non-JSON upstream error bodies", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("<html>debug traceback</html>", {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const result = await callAuthUpstream("/api/auth/me", { method: "GET" });

    expect(result.kind).toBe("response");
    if (result.kind === "response") {
      expect(result.ok).toBe(false);
      expect(result.data).toEqual({
        detail: "Authentication service is temporarily unavailable.",
      });
    }
  });

  it("forwards Cloudflare client IP with the internal proxy secret", async () => {
    process.env.GOPLAN_INTERNAL_PROXY_SECRET = "test-proxy-secret";
    vi.mocked(fetch).mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await callAuthUpstream(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      new Headers({ "CF-Connecting-IP": "203.0.113.17" }),
    );

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/auth/login",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-GoPlan-Client-IP": "203.0.113.17",
          "X-GoPlan-Internal-Proxy-Secret": "test-proxy-secret",
        }),
      }),
    );
  });
});
