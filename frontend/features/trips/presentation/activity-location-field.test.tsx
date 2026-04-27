import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ActivityLocationField,
  type ActivityLocationValue,
} from "@/features/trips/presentation/activity-location-field";
import {
  bffLookupLocation,
  bffSuggestLocations,
  LocationSearchError,
} from "@/features/trips/infrastructure/location-search-api";

vi.mock("@/features/trips/infrastructure/location-search-api", () => {
  class MockLocationSearchError extends Error {
    status?: number;

    constructor(message: string, options: { status?: number } = {}) {
      super(message);
      this.name = "LocationSearchError";
      this.status = options.status;
    }
  }

  return {
    bffLookupLocation: vi.fn(),
    bffSuggestLocations: vi.fn(),
    LocationSearchError: MockLocationSearchError,
  };
});

function Harness({
  initial,
  onChange,
}: {
  initial: ActivityLocationValue;
  onChange: (value: ActivityLocationValue) => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <ActivityLocationField
      value={value}
      onChange={(nextValue) => {
        setValue(nextValue);
        onChange(nextValue);
      }}
    />
  );
}

describe("ActivityLocationField", () => {
  beforeEach(() => {
    vi.mocked(bffSuggestLocations).mockReset();
    vi.mocked(bffLookupLocation).mockReset();
  });

  it("emits manual location when text is typed without selecting a suggestion", () => {
    const onChange = vi.fn();
    render(<Harness initial={{ label: "", place: null }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Hotel lobby" } });

    expect(onChange).toHaveBeenLastCalledWith({
      label: "Hotel lobby",
      place: null,
    } satisfies ActivityLocationValue);
  });

  it("emits structured HERE place after suggestion selection", async () => {
    vi.mocked(bffSuggestLocations).mockResolvedValue([
      { provider: "here", provider_id: "here:1", title: "Ho Xuan Huong", subtitle: "Da Lat" },
    ]);
    vi.mocked(bffLookupLocation).mockResolvedValue({
      destination: "Ho Xuan Huong, Da Lat",
      destination_provider: "here",
      destination_provider_id: "here:1",
      destination_lat: 11.94,
      destination_lng: 108.45,
      destination_country_code: "VN",
    });
    const onChange = vi.fn();
    render(<Harness initial={{ label: "", place: null }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Ho Xuan" } });
    await waitFor(() => expect(bffSuggestLocations).toHaveBeenCalledWith("Ho Xuan", expect.any(AbortSignal)));
    fireEvent.mouseDown(await screen.findByText("Ho Xuan Huong"));
    await waitFor(() => expect(bffLookupLocation).toHaveBeenCalledWith("here:1", expect.any(AbortSignal)));

    expect(onChange).toHaveBeenLastCalledWith({
      label: "Ho Xuan Huong",
      place: {
        provider: "here",
        provider_id: "here:1",
        title: "Ho Xuan Huong",
        address: "Ho Xuan Huong, Da Lat",
        lat: 11.94,
        lng: 108.45,
      },
    } satisfies ActivityLocationValue);
  });

  it("shows a recoverable search error when suggestions fail", async () => {
    vi.mocked(bffSuggestLocations).mockRejectedValue(
      new LocationSearchError("Location search is disabled.", { status: 503 }),
    );
    const onChange = vi.fn();
    render(<Harness initial={{ label: "", place: null }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Da" } });

    expect(
      await screen.findByText("Location search is unavailable. You can still enter a place manually."),
    ).not.toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({
      label: "Da",
      place: null,
    } satisfies ActivityLocationValue);
  });

  it("does not request suggestions again while lookup is resolving a selected suggestion", async () => {
    let resolveLookup: ((value: Awaited<ReturnType<typeof bffLookupLocation>>) => void) | undefined;
    vi.mocked(bffSuggestLocations).mockResolvedValue([
      { provider: "here", provider_id: "here:1", title: "Ho Xuan Huong", subtitle: "Da Lat" },
    ]);
    vi.mocked(bffLookupLocation).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        }),
    );
    const onChange = vi.fn();
    render(<Harness initial={{ label: "", place: null }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Ho Xuan" } });
    await waitFor(() => expect(bffSuggestLocations).toHaveBeenCalledTimes(1));
    fireEvent.mouseDown(await screen.findByText("Ho Xuan Huong"));

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(bffSuggestLocations).toHaveBeenCalledTimes(1);

    resolveLookup?.({
      destination: "Ho Xuan Huong, Da Lat",
      destination_provider: "here",
      destination_provider_id: "here:1",
      destination_lat: 11.94,
      destination_lng: 108.45,
      destination_country_code: "VN",
    });
    await waitFor(() => expect(bffLookupLocation).toHaveBeenCalledWith("here:1", expect.any(AbortSignal)));
  });

  it("clears structured place when selected text is edited", () => {
    const onChange = vi.fn();
    render(
      <Harness
        initial={{
          label: "Ho Xuan Huong",
          place: {
            provider: "here",
            provider_id: "here:1",
            title: "Ho Xuan Huong",
            address: "Da Lat",
            lat: 11.94,
            lng: 108.45,
          },
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Hotel lobby" } });

    expect(onChange).toHaveBeenLastCalledWith({
      label: "Hotel lobby",
      place: null,
    } satisfies ActivityLocationValue);
  });
});
