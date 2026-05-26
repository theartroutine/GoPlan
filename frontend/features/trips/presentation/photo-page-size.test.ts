import { describe, expect, it } from "vitest";

import { calculateInitialPhotoPageSize } from "@/features/trips/presentation/photo-page-size";

describe("calculateInitialPhotoPageSize", () => {
  it("fills a wide desktop first page with complete grid rows", () => {
    expect(
      calculateInitialPhotoPageSize({
        contentTop: 89,
        contentWidth: 1596,
        viewportHeight: 1080,
        viewportWidth: 1920,
      }),
    ).toBe(28);
  });

  it("keeps mobile page sizes aligned to complete grid rows", () => {
    expect(
      calculateInitialPhotoPageSize({
        contentTop: 88,
        contentWidth: 358,
        viewportHeight: 844,
        viewportWidth: 390,
      }),
    ).toBe(21);
  });

  it("caps very tall screens to avoid over-fetching thumbnails", () => {
    expect(
      calculateInitialPhotoPageSize({
        contentTop: 0,
        contentWidth: 1872,
        viewportHeight: 4000,
        viewportWidth: 1920,
      }),
    ).toBe(56);
  });
});
