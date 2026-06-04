import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nextHeadersMock = vi.hoisted(() => ({
  headers: vi.fn(),
}));

vi.mock("next/headers", () => nextHeadersMock);

function requestHeaders(values: Record<string, string>) {
  return {
    get(name: string) {
      return values[name] ?? null;
    },
  };
}

describe("PUBLIC_APP_BASE_URL", () => {
  beforeEach(() => {
    nextHeadersMock.headers.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses localhost fallback outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "");
    vi.resetModules();

    const { resolvePublicAppBaseUrl } = await import("@/shared/http/public-origin");

    await expect(resolvePublicAppBaseUrl()).resolves.toBe("http://localhost:3000");
    expect(nextHeadersMock.headers).not.toHaveBeenCalled();
  });

  it("trims trailing slashes from configured origins", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "https://goplan.example.com///");
    vi.resetModules();

    const { resolvePublicAppBaseUrl } = await import("@/shared/http/public-origin");

    await expect(resolvePublicAppBaseUrl()).resolves.toBe("https://goplan.example.com");
    expect(nextHeadersMock.headers).not.toHaveBeenCalled();
  });

  it("derives production origin from forwarded request headers when env is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "");
    nextHeadersMock.headers.mockResolvedValue(
      requestHeaders({
        "x-forwarded-host": "goplan.example.com",
        "x-forwarded-proto": "https",
      }),
    );
    vi.resetModules();

    const { resolvePublicAppBaseUrl } = await import("@/shared/http/public-origin");

    await expect(resolvePublicAppBaseUrl()).resolves.toBe("https://goplan.example.com");
  });

  it("fails fast in production when neither env nor request host is available", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "");
    nextHeadersMock.headers.mockResolvedValue(requestHeaders({}));
    vi.resetModules();

    const { resolvePublicAppBaseUrl } = await import("@/shared/http/public-origin");

    await expect(resolvePublicAppBaseUrl()).rejects.toThrow(
      "Missing NEXT_PUBLIC_APP_BASE_URL and request host",
    );
  });
});
