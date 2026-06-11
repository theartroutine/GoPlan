import { describe, expect, it, vi } from "vitest";

import {
  classifySource,
  scaledDimensions,
  webpFileName,
  preprocessImageFile,
  type DecodedBitmap,
  type ImageCodec,
} from "@/shared/lib/image-preprocess";

describe("classifySource", () => {
  it("detects HEIC by MIME type and by extension", () => {
    expect(classifySource({ name: "a.heic", type: "image/heic" })).toBe("heic");
    expect(classifySource({ name: "b.HEIF", type: "" })).toBe("heic");
    expect(classifySource({ name: "c.heic", type: "application/octet-stream" })).toBe("heic");
  });

  it("treats JPEG/PNG/WebP as standard", () => {
    expect(classifySource({ name: "a.jpg", type: "image/jpeg" })).toBe("standard");
    expect(classifySource({ name: "b.png", type: "image/png" })).toBe("standard");
    expect(classifySource({ name: "c.webp", type: "image/webp" })).toBe("standard");
  });

  it("lets empty or generic binary MIME through as standard so decode decides", () => {
    expect(classifySource({ name: "photo.jpg", type: "" })).toBe("standard");
    expect(classifySource({ name: "photo.jpg", type: "application/octet-stream" })).toBe("standard");
  });

  it("rejects SVG and known non-image types", () => {
    expect(classifySource({ name: "x.svg", type: "image/svg+xml" })).toBe("unsupported");
    expect(classifySource({ name: "x.SVG", type: "" })).toBe("unsupported");
    expect(classifySource({ name: "doc.pdf", type: "application/pdf" })).toBe("unsupported");
  });
});

describe("scaledDimensions", () => {
  it("returns input unchanged when the long edge fits", () => {
    expect(scaledDimensions(2560, 1440, 2560)).toEqual({ width: 2560, height: 1440 });
  });

  it("scales the long edge down to the cap preserving aspect ratio", () => {
    expect(scaledDimensions(4000, 3000, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(scaledDimensions(3000, 4000, 2560)).toEqual({ width: 1920, height: 2560 });
  });

  it("never returns dimensions below 1", () => {
    expect(scaledDimensions(10000, 1, 2560)).toEqual({ width: 2560, height: 1 });
  });
});

describe("webpFileName", () => {
  it("swaps the extension for .webp", () => {
    expect(webpFileName("IMG_0001.HEIC")).toBe("IMG_0001.webp");
    expect(webpFileName("photo.jpeg")).toBe("photo.webp");
  });

  it("handles names without an extension", () => {
    expect(webpFileName("photo")).toBe("photo.webp");
    expect(webpFileName("")).toBe("photo.webp");
  });
});

function fakeBitmap(width: number, height: number): DecodedBitmap & { close: ReturnType<typeof vi.fn> } {
  return { width, height, source: {}, close: vi.fn() };
}

function fakeCodec(overrides: Partial<ImageCodec> = {}): ImageCodec {
  return {
    decode: vi.fn().mockRejectedValue(new Error("decode not stubbed")),
    encodeWebP: vi.fn().mockRejectedValue(new Error("encode not stubbed")),
    decodeHeic: vi.fn().mockRejectedValue(new Error("heic not stubbed")),
    ...overrides,
  };
}

const TARGET = { maxEdgePx: 2560, maxBytes: 10 * 1024 * 1024 };

describe("preprocessImageFile", () => {
  it("passes small standard files through untouched", async () => {
    const file = new File(["x"], "small.jpg", { type: "image/jpeg" });
    const bitmap = fakeBitmap(1200, 800);
    const codec = fakeCodec({ decode: vi.fn().mockResolvedValue(bitmap) });

    const result = await preprocessImageFile(file, TARGET, codec);

    expect(result).toEqual({ ok: true, file, wasProcessed: false });
    expect(codec.encodeWebP).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("downscales and re-encodes oversized standard files to WebP", async () => {
    const file = new File(["x"], "big.png", { type: "image/png" });
    const bitmap = fakeBitmap(4000, 3000);
    const encoded = new Blob(["webp"], { type: "image/webp" });
    const codec = fakeCodec({
      decode: vi.fn().mockResolvedValue(bitmap),
      encodeWebP: vi.fn().mockResolvedValue(encoded),
    });

    const result = await preprocessImageFile(file, TARGET, codec);

    expect(codec.encodeWebP).toHaveBeenCalledWith(bitmap, 2560, 1920, 0.9);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.wasProcessed).toBe(true);
      expect(result.file.name).toBe("big.webp");
      expect(result.file.type).toBe("image/webp");
    }
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("re-encodes within-edge files that exceed the byte budget", async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    const file = new File([big], "huge.jpg", { type: "image/jpeg" });
    const bitmap = fakeBitmap(2400, 1600);
    const codec = fakeCodec({
      decode: vi.fn().mockResolvedValue(bitmap),
      encodeWebP: vi.fn().mockResolvedValue(new Blob(["small"], { type: "image/webp" })),
    });

    const result = await preprocessImageFile(file, TARGET, codec);

    expect(codec.encodeWebP).toHaveBeenCalledWith(bitmap, 2400, 1600, 0.9);
    expect(result.ok && result.wasProcessed).toBe(true);
  });

  it("steps quality down until the encoded size fits", async () => {
    const file = new File(["x"], "big.jpg", { type: "image/jpeg" });
    const bitmap = fakeBitmap(8000, 6000);
    const tooBig = { size: TARGET.maxBytes + 1 } as Blob;
    const fits = new Blob(["ok"], { type: "image/webp" });
    const encodeWebP = vi.fn().mockResolvedValueOnce(tooBig).mockResolvedValueOnce(fits);
    const codec = fakeCodec({
      decode: vi.fn().mockResolvedValue(bitmap),
      encodeWebP,
    });

    const result = await preprocessImageFile(file, TARGET, codec);

    expect(encodeWebP).toHaveBeenNthCalledWith(1, bitmap, 2560, 1920, 0.9);
    expect(encodeWebP).toHaveBeenNthCalledWith(2, bitmap, 2560, 1920, 0.8);
    expect(result.ok).toBe(true);
  });

  it("decodes HEIC first, then re-encodes even when dimensions fit", async () => {
    const file = new File(["x"], "IMG_0001.HEIC", { type: "image/heic" });
    const intermediate = new Blob(["jpeg"], { type: "image/jpeg" });
    const bitmap = fakeBitmap(2000, 1500);
    const codec = fakeCodec({
      decodeHeic: vi.fn().mockResolvedValue(intermediate),
      decode: vi.fn().mockResolvedValue(bitmap),
      encodeWebP: vi.fn().mockResolvedValue(new Blob(["webp"], { type: "image/webp" })),
    });

    const result = await preprocessImageFile(file, TARGET, codec);

    expect(codec.decodeHeic).toHaveBeenCalledWith(file);
    expect(codec.decode).toHaveBeenCalledWith(intermediate);
    expect(codec.encodeWebP).toHaveBeenCalledWith(bitmap, 2000, 1500, 0.9);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file.name).toBe("IMG_0001.webp");
  });

  it("returns UNSUPPORTED for SVG without touching the codec", async () => {
    const file = new File(["<svg/>"], "x.svg", { type: "image/svg+xml" });
    const codec = fakeCodec();

    const result = await preprocessImageFile(file, TARGET, codec);

    expect(result).toEqual({ ok: false, code: "UNSUPPORTED" });
    expect(codec.decode).not.toHaveBeenCalled();
  });

  it("returns UNREADABLE when HEIC decoding fails", async () => {
    const file = new File(["x"], "broken.heic", { type: "image/heic" });
    const codec = fakeCodec({ decodeHeic: vi.fn().mockRejectedValue(new Error("boom")) });

    const result = await preprocessImageFile(file, TARGET, codec);

    expect(result).toEqual({ ok: false, code: "UNREADABLE" });
  });

  it("returns UNREADABLE when bitmap decoding fails", async () => {
    const file = new File(["x"], "corrupt.jpg", { type: "image/jpeg" });
    const codec = fakeCodec({ decode: vi.fn().mockRejectedValue(new Error("boom")) });

    const result = await preprocessImageFile(file, TARGET, codec);

    expect(result).toEqual({ ok: false, code: "UNREADABLE" });
  });
});
