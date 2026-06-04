import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseContentDispositionFilename,
  triggerBrowserDownload,
} from "@/features/trips/infrastructure/download-file";

describe("parseContentDispositionFilename", () => {
  it("reads a plain quoted filename", () => {
    expect(
      parseContentDispositionFilename(
        'attachment; filename="ha-long.webp"',
        "fallback.webp",
      ),
    ).toBe("ha-long.webp");
  });

  it("decodes an RFC 5987 extended filename", () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename*=UTF-8''H%E1%BA%A1%20Long.webp",
        "fallback.webp",
      ),
    ).toBe("Hạ Long.webp");
  });

  it("falls back when the header is missing or unparseable", () => {
    expect(parseContentDispositionFilename(null, "fallback.zip")).toBe("fallback.zip");
    expect(parseContentDispositionFilename("attachment", "fallback.zip")).toBe(
      "fallback.zip",
    );
  });
});

describe("triggerBrowserDownload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("creates an anchor, clicks it, and revokes the object URL on the next tick", () => {
    const blob = new Blob(["data"], { type: "application/zip" });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    triggerBrowserDownload(blob, "trip-photos.zip");

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a")).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    clickSpy.mockRestore();
  });
});
