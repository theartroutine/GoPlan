import { describe, expect, it } from "vitest";

import { formatDateOnly, getInclusiveDateOnlySpan } from "@/features/trips/domain/date-only";

describe("date-only helpers", () => {
  it("formats YYYY-MM-DD values without shifting the calendar day", () => {
    expect(
      formatDateOnly("2026-06-01", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    ).toBe("Jun 1, 2026");
  });

  it("counts inclusive trip days correctly across DST boundaries", () => {
    expect(getInclusiveDateOnlySpan("2026-03-07", "2026-03-09")).toBe(3);
  });
});
