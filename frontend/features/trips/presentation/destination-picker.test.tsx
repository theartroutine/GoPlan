import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const locationSearchApiMock = vi.hoisted(() => ({
  bffLookupLocation: vi.fn(),
  bffSuggestLocations: vi.fn(),
}));

vi.mock("@/features/trips/infrastructure/location-search-api", () => locationSearchApiMock);

import { DestinationPicker } from "@/features/trips/presentation/destination-picker";

describe("DestinationPicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    locationSearchApiMock.bffSuggestLocations.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts the previous suggest request when a new query is typed", async () => {
    locationSearchApiMock.bffSuggestLocations
      .mockImplementationOnce((_query: string, signal?: AbortSignal) =>
        new Promise((resolve) => {
          signal?.addEventListener("abort", () => resolve([]));
        }),
      )
      .mockResolvedValueOnce([]);

    render(<DestinationPicker onChange={() => undefined} />);

    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "ha" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(locationSearchApiMock.bffSuggestLocations).toHaveBeenCalledTimes(1);

    const firstSignal = locationSearchApiMock.bffSuggestLocations.mock.calls[0]?.[1] as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    fireEvent.change(input, { target: { value: "han" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(locationSearchApiMock.bffSuggestLocations).toHaveBeenCalledTimes(2);

    expect(firstSignal.aborted).toBe(true);
  });

  it("does not re-fetch when the trimmed query did not change", async () => {
    render(<DestinationPicker onChange={() => undefined} />);

    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "hanoi" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(locationSearchApiMock.bffSuggestLocations).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: "hanoi " } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(locationSearchApiMock.bffSuggestLocations).toHaveBeenCalledTimes(1);
  });
});
