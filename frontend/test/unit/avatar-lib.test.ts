import { describe, it, expect } from "vitest";

import { getInitials, deriveGradient } from "@/shared/lib/avatar";

describe("getInitials", () => {
  it("returns two letters for a multi-word name", () => {
    expect(getInitials("Dương Minh")).toBe("DM");
  });

  it("returns the first two letters for a single-word name", () => {
    expect(getInitials("Minh")).toBe("MI");
  });

  it("returns '?' for empty input", () => {
    expect(getInitials("")).toBe("?");
  });
});

describe("deriveGradient", () => {
  it("is deterministic for the same seed", () => {
    expect(deriveGradient("alice#123456")).toBe(deriveGradient("alice#123456"));
  });

  it("returns a non-empty Tailwind className string", () => {
    const className = deriveGradient("alice#123456");
    expect(typeof className).toBe("string");
    expect(className.length).toBeGreaterThan(0);
  });

  it("produces different classes for different seeds (likely, not strictly)", () => {
    const variants = new Set([
      deriveGradient("a"),
      deriveGradient("b"),
      deriveGradient("c"),
      deriveGradient("d"),
      deriveGradient("e"),
    ]);
    expect(variants.size).toBeGreaterThan(1);
  });
});
