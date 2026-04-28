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

  it("sends budget estimate when creating a trip", async () => {
    render(<CreateTripForm />);

    fireEvent.change(screen.getByLabelText(/trip name/i), {
      target: { value: "Summer Trip" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Da Nang" },
    });
    fireEvent.change(screen.getByLabelText(/start date/i), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByLabelText(/end date/i), {
      target: { value: "2026-06-05" },
    });
    fireEvent.change(screen.getByLabelText(/budget estimate/i), {
      target: { value: "5000000" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create trip/i }));

    await waitFor(() => {
      expect(tripsApiMock.bffCreateTrip).toHaveBeenCalledWith(
        expect.objectContaining({
          budget_estimate: "5000000",
        }),
      );
    });
  });
});
