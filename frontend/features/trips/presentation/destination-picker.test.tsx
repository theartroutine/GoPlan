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

  it("does not suggest locations for the initial value until the user edits it", async () => {
    render(<DestinationPicker initialValue="Da Nang" onChange={() => undefined} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(input.value).toBe("Da Nang");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(locationSearchApiMock.bffSuggestLocations).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "Da Nang City" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(locationSearchApiMock.bffSuggestLocations).toHaveBeenCalledWith(
      "Da Nang City",
      expect.any(AbortSignal),
    );
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

  it("ignores stale lookup responses after the user keeps typing", async () => {
    let resolveLookup:
      | ((value: {
          destination: string;
          destination_provider: "here";
          destination_provider_id: string;
          destination_lat: number | null;
          destination_lng: number | null;
          destination_country_code: string;
        } | null) => void)
      | undefined;

    locationSearchApiMock.bffSuggestLocations.mockResolvedValueOnce([
      {
        provider: "here",
        provider_id: "here:da-nang",
        title: "Da Nang",
        subtitle: "Vietnam",
      },
    ]);
    locationSearchApiMock.bffLookupLocation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        }),
    );

    const onChange = vi.fn();
    render(<DestinationPicker onChange={onChange} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "da" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
    });

    const option = screen.getByRole("option", { name: /Da Nang/i });
    fireEvent.mouseDown(option);

    fireEvent.change(input, { target: { value: "dalat" } });

    await act(async () => {
      resolveLookup?.({
        destination: "Da Nang, Vietnam",
        destination_provider: "here",
        destination_provider_id: "here:da-nang",
        destination_lat: 16.0544,
        destination_lng: 108.2022,
        destination_country_code: "VN",
      });
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
    expect(input.value).toBe("dalat");
  });

  it("propagates the selected suggestion text immediately while lookup is pending", async () => {
    locationSearchApiMock.bffSuggestLocations.mockResolvedValueOnce([
      {
        provider: "here",
        provider_id: "here:da-nang",
        title: "Da Nang",
        subtitle: "Vietnam",
      },
    ]);
    locationSearchApiMock.bffLookupLocation.mockImplementationOnce(
      () =>
        new Promise(() => {
          // Keep lookup pending to verify parent text sync before details resolve.
        }),
    );

    const onRawInputChange = vi.fn();

    render(
      <DestinationPicker
        onChange={() => undefined}
        onRawInputChange={onRawInputChange}
      />,
    );

    const input = screen.getByRole("combobox") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "da" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
    });

    fireEvent.mouseDown(screen.getByRole("option", { name: /Da Nang/i }));

    expect(onRawInputChange).toHaveBeenLastCalledWith("Da Nang, Vietnam");
    expect(input.value).toBe("Da Nang, Vietnam");
  });
});
