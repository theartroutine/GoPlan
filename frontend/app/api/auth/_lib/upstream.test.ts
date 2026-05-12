import { beforeEach, describe, expect, it, vi } from "vitest";

import { callAuthUpstream } from "@/app/api/auth/_lib/upstream";

vi.mock("@/shared/http/config", () => ({
  API_BASE_URL: "https://api.example.com",
}));

describe("callAuthUpstream", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
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
});
