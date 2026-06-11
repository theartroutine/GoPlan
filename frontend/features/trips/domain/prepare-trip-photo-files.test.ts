import { describe, expect, it, vi } from "vitest";

import {
  TRIP_PHOTO_PREPROCESS_TARGET,
  prepareTripPhotoFiles,
} from "@/features/trips/domain/prepare-trip-photo-files";
import type { PreprocessResult } from "@/shared/lib/image-preprocess";

function okResult(file: File): PreprocessResult {
  return { ok: true, file, wasProcessed: true };
}

describe("prepareTripPhotoFiles", () => {
  it("preprocesses every file with the trip photo target, then validates", async () => {
    const input = [
      new File(["a"], "a.heic", { type: "image/heic" }),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
    ];
    const processed = [
      new File(["a"], "a.webp", { type: "image/webp" }),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
    ];
    const preprocess = vi
      .fn()
      .mockResolvedValueOnce(okResult(processed[0]))
      .mockResolvedValueOnce({ ok: true, file: processed[1], wasProcessed: false });

    const result = await prepareTripPhotoFiles(input, preprocess);

    expect(preprocess).toHaveBeenCalledTimes(2);
    expect(preprocess).toHaveBeenCalledWith(input[0], TRIP_PHOTO_PREPROCESS_TARGET);
    expect(result).toEqual({ ok: true, files: processed });
  });

  it("maps UNSUPPORTED to a format message", async () => {
    const preprocess = vi.fn().mockResolvedValue({ ok: false, code: "UNSUPPORTED" });

    const result = await prepareTripPhotoFiles(
      [new File(["x"], "x.svg", { type: "image/svg+xml" })],
      preprocess,
    );

    expect(result).toEqual({
      ok: false,
      message: "Use JPEG, PNG, WebP, or HEIC photos. SVG and other formats are not supported.",
    });
  });

  it("maps UNREADABLE to a decode-failure message", async () => {
    const preprocess = vi.fn().mockResolvedValue({ ok: false, code: "UNREADABLE" });

    const result = await prepareTripPhotoFiles(
      [new File(["x"], "broken.heic", { type: "image/heic" })],
      preprocess,
    );

    expect(result).toEqual({
      ok: false,
      message: "Could not read this photo. Convert it to JPEG and try again.",
    });
  });

  it("still rejects more than 20 files after preprocessing", async () => {
    const files = Array.from({ length: 21 }, (_, i) =>
      new File(["x"], `p${i}.jpg`, { type: "image/jpeg" }),
    );
    const preprocess = vi
      .fn()
      .mockImplementation((file: File) =>
        Promise.resolve({ ok: true, file, wasProcessed: false }),
      );

    const result = await prepareTripPhotoFiles(files, preprocess);

    expect(result).toEqual({ ok: false, message: "Upload up to 20 photos at a time." });
  });

  it("validates total upload size on the processed output, not the input", async () => {
    const input = [
      new File(["a"], "a.jpg", { type: "image/jpeg" }),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
    ];
    // Small inputs grow past the 50 MiB total budget after processing; the
    // total check runs before the per-file check, so this exercises it.
    const bigChunk = new Uint8Array(26 * 1024 * 1024);
    const preprocess = vi.fn().mockImplementation((file: File) =>
      Promise.resolve({
        ok: true,
        file: new File([bigChunk], file.name, { type: "image/jpeg" }),
        wasProcessed: true,
      }),
    );

    const result = await prepareTripPhotoFiles(input, preprocess);

    expect(result).toEqual({ ok: false, message: "Upload up to 50 MiB of photos at a time." });
  });
});
