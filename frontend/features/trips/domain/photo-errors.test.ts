import { describe, expect, it } from "vitest";

import {
  getTripPhotoErrorMessage,
  validateTripPhotoFiles,
} from "@/features/trips/domain/photo-errors";

describe("photo-errors", () => {
  it("maps UNSUPPORTED_IMAGE_TYPE to user-friendly copy", () => {
    const error = {
      isAxiosError: true,
      response: {
        status: 415,
        data: {
          detail: "Unsupported image format.",
          error_code: "UNSUPPORTED_IMAGE_TYPE",
        },
      },
    };

    expect(getTripPhotoErrorMessage(error, "Upload failed.")).toBe(
      "Use JPEG, PNG, WebP, or HEIC photos. SVG and other formats are not supported.",
    );
  });

  it("maps backend HEIC_UNSUPPORTED to the decode-failure copy", () => {
    const error = {
      isAxiosError: true,
      response: {
        status: 415,
        data: {
          detail: "HEIC images are not supported yet.",
          error_code: "HEIC_UNSUPPORTED",
        },
      },
    };

    expect(getTripPhotoErrorMessage(error, "Upload failed.")).toBe(
      "Could not read this photo. Convert it to JPEG and try again.",
    );
  });

  it("validates selected files before upload", () => {
    expect(validateTripPhotoFiles([])).toEqual({
      ok: false,
      message: "Choose at least one photo.",
    });

    expect(
      validateTripPhotoFiles([
        new File(["heic"], "memory.heic", { type: "image/heic" }),
      ]),
    ).toEqual({
      ok: false,
      message: "Use JPEG, PNG, WebP, or HEIC photos. SVG and other formats are not supported.",
    });

    expect(
      validateTripPhotoFiles([
        new File(["svg"], "memory.svg", { type: "image/svg+xml" }),
      ]),
    ).toEqual({
      ok: false,
      message: "Use JPEG, PNG, WebP, or HEIC photos. SVG and other formats are not supported.",
    });

    expect(
      validateTripPhotoFiles([
        { name: "one.jpg", size: 9 * 1024 * 1024, type: "image/jpeg" } as File,
        { name: "two.jpg", size: 9 * 1024 * 1024, type: "image/jpeg" } as File,
        { name: "three.jpg", size: 9 * 1024 * 1024, type: "image/jpeg" } as File,
        { name: "four.jpg", size: 9 * 1024 * 1024, type: "image/jpeg" } as File,
        { name: "five.jpg", size: 9 * 1024 * 1024, type: "image/jpeg" } as File,
        { name: "six.jpg", size: 9 * 1024 * 1024, type: "image/jpeg" } as File,
      ]),
    ).toEqual({
      ok: false,
      message: "Upload up to 50 MiB of photos at a time.",
    });

    expect(
      validateTripPhotoFiles([
        new File(["jpeg"], "memory.jpg", { type: "" }),
        new File(["webp"], "memory.webp", { type: "application/octet-stream" }),
      ]),
    ).toEqual({ ok: true });
  });
});
