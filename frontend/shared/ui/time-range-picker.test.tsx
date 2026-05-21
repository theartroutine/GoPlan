import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimeRangePicker } from "@/shared/ui/time-range-picker";

describe("TimeRangePicker", () => {
  it("clears a stale end time when the user removes it", () => {
    const onChange = vi.fn();
    const onError = vi.fn();

    render(
      <TimeRangePicker
        sectionIndex={1}
        sectionDate="2026-06-01"
        tripTimezone="UTC"
        value={{ start: "08:30", end: "10:00" }}
        onChange={onChange}
        onError={onError}
      />,
    );

    fireEvent.change(screen.getByLabelText("Ends at"), {
      target: { value: "" },
    });

    expect(onChange).toHaveBeenLastCalledWith({ start: "08:30", end: null });
    expect(screen.getByText("End time is required.")).toBeInTheDocument();
    expect(onError).toHaveBeenLastCalledWith("End time is required.");
  });
});
