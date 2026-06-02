import { describe, expect, it } from "vitest";

import { getTripMemoryErrorMessage } from "@/features/trips/domain/memory-errors";

describe("getTripMemoryErrorMessage", () => {
  it("uses backend detail for photo selection errors because limits are dynamic", () => {
    const message = getTripMemoryErrorMessage(
      {
        response: {
          data: {
            detail: "Select between 3 and 12 usable photos.",
            error_code: "MEMORY_INVALID_PHOTO_SELECTION",
          },
        },
      },
      "Could not create memory video.",
    );

    expect(message).toBe("Select between 3 and 12 usable photos.");
  });

  it("keeps curated copy for known errors without dynamic detail", () => {
    const message = getTripMemoryErrorMessage(
      {
        response: {
          data: {
            error_code: "MEMORY_DELETE_BLOCKED",
          },
        },
      },
      "Could not delete this memory video.",
    );

    expect(message).toBe("Memory videos can only be deleted after rendering finishes.");
  });
});
