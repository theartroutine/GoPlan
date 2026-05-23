import { describe, expect, it } from "vitest";

import {
  getTripPhotoErrorMessage,
  validateTripPhotoFiles,
} from "@/features/trips/domain/photo-errors";

describe("photo-errors", () => {
  it("maps HEIC_UNSUPPORTED to user-friendly copy", () => {
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
      "HEIC photos are not supported yet. Convert them to JPEG, PNG, or WebP and try again.",
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
      message:
        "HEIC photos are not supported yet. Convert them to JPEG, PNG, or WebP and try again.",
    });

    expect(
      validateTripPhotoFiles([
        new File(["svg"], "memory.svg", { type: "image/svg+xml" }),
      ]),
    ).toEqual({
      ok: false,
      message: "Use JPEG, PNG, or WebP photos. SVG and other formats are not supported.",
    });

    expect(
      validateTripPhotoFiles([
        new File(["jpeg"], "memory.jpg", { type: "" }),
        new File(["webp"], "memory.webp", { type: "application/octet-stream" }),
      ]),
    ).toEqual({ ok: true });
  });
});
