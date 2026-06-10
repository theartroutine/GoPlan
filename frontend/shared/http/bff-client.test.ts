import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bff } from "@/shared/http/bff-client";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/features/auth/infrastructure/token-manager", () => ({
  tokenManager: { get: () => null, set: vi.fn() },
}));

function throttledAdapter(config: InternalAxiosRequestConfig) {
  const headers = new AxiosHeaders({ "retry-after": "37" });
  return Promise.reject(
    new AxiosError("Too many requests", "ERR_BAD_REQUEST", config, null, {
      status: 429,
      statusText: "Too Many Requests",
      data: {},
      headers,
      config,
    }),
  );
}

describe("bff client 429 toast", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it("toasts the Retry-After message by default", async () => {
    await expect(
      bff.get("/api/anything", { adapter: throttledAdapter }),
    ).rejects.toThrow();

    expect(toast.error).toHaveBeenCalledWith(
      "Too many requests. Please try again in 37s.",
    );
  });

  it("suppresses the toast when suppressThrottleToast is set", async () => {
    await expect(
      bff.get("/api/anything", {
        adapter: throttledAdapter,
        suppressThrottleToast: true,
      }),
    ).rejects.toThrow();

    expect(toast.error).not.toHaveBeenCalled();
  });
});
