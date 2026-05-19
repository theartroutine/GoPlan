import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.hoisted(() => vi.fn());
const tripsApiMock = vi.hoisted(() => ({
  bffCreateTrip: vi.fn(),
  bffUploadTripCover: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock("@/features/trips/infrastructure/trips-api", () => tripsApiMock);

vi.mock("@/features/trips/presentation/destination-picker", () => ({
  DestinationPicker({
    id,
    onRawInputChange,
    required,
  }: {
    id?: string;
    onRawInputChange?: (text: string) => void;
    required?: boolean;
  }) {
    return (
      <input
        id={id}
        role="combobox"
        aria-controls="destination-listbox"
        aria-expanded="false"
        required={required}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          onRawInputChange?.(event.target.value);
        }}
      />
    );
  },
}));

vi.mock("@/shared/ui/date-picker", () => ({
  DatePicker({
    id,
    value,
    onChange,
  }: {
    id?: string;
    value?: string;
    onChange: (date: string | undefined) => void;
  }) {
    return (
      <input
        id={id}
        type="date"
        value={value ?? ""}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          onChange(event.target.value || undefined);
        }}
      />
    );
  },
}));

import { CreateTripForm } from "@/features/trips/presentation/create-trip-form";

describe("CreateTripForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tripsApiMock.bffCreateTrip.mockResolvedValue({ trip: { id: "trip-1" } });
  });

  it("shows a cancel link back to the trips dashboard", () => {
    render(<CreateTripForm />);

    const cancelLink = screen.getByRole("link", { name: /cancel/i });

    expect(cancelLink.getAttribute("href")).toBe("/");
  });

  it("formats VND budget input and sends the default VND currency when creating a trip", async () => {
    render(<CreateTripForm />);

    fireEvent.change(screen.getByLabelText(/trip name/i), {
      target: { value: "Summer Trip" },
    });
    fireEvent.change(screen.getByLabelText(/destination/i), {
      target: { value: "Da Nang" },
    });
    fireEvent.change(screen.getByLabelText(/start date/i), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByLabelText(/end date/i), {
      target: { value: "2026-06-05" },
    });
    fireEvent.change(screen.getByLabelText(/budget estimate/i), {
      target: { value: "1000" },
    });

    expect((screen.getByLabelText(/budget estimate/i) as HTMLInputElement).value).toBe("1.000");

    fireEvent.click(screen.getByRole("button", { name: /create trip/i }));

    await waitFor(() => {
      expect(tripsApiMock.bffCreateTrip).toHaveBeenCalledWith(
        expect.objectContaining({
          currency_code: "VND",
          budget_estimate: "1000",
        }),
      );
    });
  });

  it("sends the selected currency when creating a trip", async () => {
    render(<CreateTripForm />);

    fireEvent.change(screen.getByLabelText(/trip name/i), {
      target: { value: "Summer Trip" },
    });
    fireEvent.change(screen.getByLabelText(/destination/i), {
      target: { value: "Da Nang" },
    });
    fireEvent.change(screen.getByLabelText(/start date/i), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByLabelText(/end date/i), {
      target: { value: "2026-06-05" },
    });
    fireEvent.change(screen.getByLabelText(/currency/i), {
      target: { value: "USD" },
    });
    fireEvent.change(screen.getByLabelText(/budget estimate/i), {
      target: { value: "1000.50" },
    });

    expect((screen.getByLabelText(/budget estimate/i) as HTMLInputElement).value).toBe("1000.50");

    fireEvent.click(screen.getByRole("button", { name: /create trip/i }));

    await waitFor(() => {
      expect(tripsApiMock.bffCreateTrip).toHaveBeenCalledWith(
        expect.objectContaining({
          currency_code: "USD",
          budget_estimate: "1000.50",
        }),
      );
    });
  });

  it("recommends timezone options while creating a trip", () => {
    render(<CreateTripForm />);

    fireEvent.change(screen.getByLabelText(/trip timezone/i), {
      target: { value: "Tokyo" },
    });

    expect(screen.getByRole("option", { name: "Asia/Tokyo" })).toBeTruthy();
  });

  it("limits trip description to the overview-safe length", () => {
    render(<CreateTripForm />);

    const description = screen.getByLabelText(/description/i);

    expect(description).toHaveAttribute("maxLength", "180");
    expect(screen.getByText("0/180 characters")).toBeInTheDocument();
  });
});
