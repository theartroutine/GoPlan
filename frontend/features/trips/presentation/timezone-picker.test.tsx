import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimezonePicker } from "@/features/trips/presentation/timezone-picker";

describe("TimezonePicker", () => {
  it("matches timezone names when the user types spaces instead of separators", () => {
    render(
      <TimezonePicker
        id="timezone"
        value="Asia/Ho_Chi_Minh"
        onChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Ho Chi" },
    });

    expect(screen.getByRole("option", { name: "Asia/Ho_Chi_Minh" })).toBeTruthy();
  });
});
