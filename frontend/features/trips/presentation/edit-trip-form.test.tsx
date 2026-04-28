import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.hoisted(() => vi.fn());
const tripsApiMock = vi.hoisted(() => ({
  bffUpdateTrip: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock("@/features/trips/infrastructure/trips-api", () => tripsApiMock);

import { EditTripForm } from "@/features/trips/presentation/edit-trip-form";

describe("EditTripForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tripsApiMock.bffUpdateTrip.mockRejectedValue(new Error("backend validation failed"));
  });

  it("blocks submission when destination is cleared", async () => {
    render(
      <EditTripForm
        trip={{
          id: "trip-1",
          name: "Summer Trip",
          destination: "Da Nang",
          destination_provider: "",
          destination_provider_id: "",
          destination_lat: null,
          destination_lng: null,
          destination_country_code: "",
          cover_image_url: "",
          start_date: "2026-06-01",
          end_date: "2026-06-05",
          description: "",
          status: "PLANNING",
          currency_code: "VND",
          timezone: "Asia/Ho_Chi_Minh",
          budget_estimate: null,
          cancelled_at: null,
          created_at: "2026-04-20T00:00:00Z",
        }}
      />,
    );

    const destinationInput = screen.getByLabelText(/destination/i);

    fireEvent.change(destinationInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(destinationInput.getAttribute("required")).toBe("");
    expect(tripsApiMock.bffUpdateTrip).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("formats VND budget input and sends budget estimate when updating a trip", async () => {
    tripsApiMock.bffUpdateTrip.mockResolvedValueOnce({ trip: { id: "trip-1" } });
    const onSaved = vi.fn().mockResolvedValue(undefined);

    render(
      <EditTripForm
        onSaved={onSaved}
        trip={{
          id: "trip-1",
          name: "Summer Trip",
          destination: "Da Nang",
          destination_provider: "",
          destination_provider_id: "",
          destination_lat: null,
          destination_lng: null,
          destination_country_code: "",
          cover_image_url: "",
          start_date: "2026-06-01",
          end_date: "2026-06-05",
          description: "",
          status: "PLANNING",
          currency_code: "VND",
          timezone: "Asia/Ho_Chi_Minh",
          budget_estimate: "3000000.00",
          cancelled_at: null,
          created_at: "2026-04-20T00:00:00Z",
        }}
      />,
    );

    expect((screen.getByLabelText(/budget estimate/i) as HTMLInputElement).value).toBe("3.000.000");

    fireEvent.change(screen.getByLabelText(/budget estimate/i), {
      target: { value: "5000000" },
    });

    expect((screen.getByLabelText(/budget estimate/i) as HTMLInputElement).value).toBe("5.000.000");

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(tripsApiMock.bffUpdateTrip).toHaveBeenCalledWith(
        "trip-1",
        expect.objectContaining({
          budget_estimate: "5000000",
        }),
      );
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
    expect(routerPush).toHaveBeenCalledWith("/trips/trip-1/overview");
    expect(onSaved.mock.invocationCallOrder[0]).toBeLessThan(routerPush.mock.invocationCallOrder[0]);
  });

  it("sends currency code when updating a trip currency", async () => {
    tripsApiMock.bffUpdateTrip.mockResolvedValueOnce({ trip: { id: "trip-1" } });

    render(
      <EditTripForm
        trip={{
          id: "trip-1",
          name: "Summer Trip",
          destination: "Da Nang",
          destination_provider: "",
          destination_provider_id: "",
          destination_lat: null,
          destination_lng: null,
          destination_country_code: "",
          cover_image_url: "",
          start_date: "2026-06-01",
          end_date: "2026-06-05",
          description: "",
          status: "PLANNING",
          currency_code: "VND",
          timezone: "Asia/Ho_Chi_Minh",
          budget_estimate: "3000000.00",
          cancelled_at: null,
          created_at: "2026-04-20T00:00:00Z",
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText(/currency/i), {
      target: { value: "USD" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(tripsApiMock.bffUpdateTrip).toHaveBeenCalledWith(
        "trip-1",
        expect.objectContaining({
          currency_code: "USD",
        }),
      );
    });
  });

  it("recommends timezone options while editing a trip", () => {
    render(
      <EditTripForm
        trip={{
          id: "trip-1",
          name: "Summer Trip",
          destination: "Da Nang",
          destination_provider: "",
          destination_provider_id: "",
          destination_lat: null,
          destination_lng: null,
          destination_country_code: "",
          cover_image_url: "",
          start_date: "2026-06-01",
          end_date: "2026-06-05",
          description: "",
          status: "PLANNING",
          currency_code: "VND",
          timezone: "Asia/Ho_Chi_Minh",
          budget_estimate: "3000000.00",
          cancelled_at: null,
          created_at: "2026-04-20T00:00:00Z",
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText(/trip timezone/i), {
      target: { value: "Tokyo" },
    });

    expect(screen.getByRole("option", { name: "Asia/Tokyo" })).toBeTruthy();
  });
});
