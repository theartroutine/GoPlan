import { describe, expect, it } from "vitest";

import {
  classifySource,
  scaledDimensions,
  webpFileName,
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
