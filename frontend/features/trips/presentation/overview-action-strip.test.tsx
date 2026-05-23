import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { bffCancelTrip } from "@/features/trips/infrastructure/trips-api";

import { OverviewActionStrip } from "./overview-action-strip";

vi.mock("@/features/trips/infrastructure/trips-api", () => ({
  bffCancelTrip: vi.fn(),
}));

describe("OverviewActionStrip", () => {
  it("returns null when user is not captain", () => {
    const { container } = render(
      <OverviewActionStrip
        tripId="trip-1"
        isCaptain={false}
        isTerminal={false}
        memberCount={3}
        onCancelled={() => Promise.resolve()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders Edit + Cancel for captain on non-terminal trip", () => {
    render(
      <OverviewActionStrip
        tripId="trip-1"
        isCaptain={true}
        isTerminal={false}
        memberCount={3}
        onCancelled={() => Promise.resolve()}
      />,
    );
    expect(screen.getByRole("link", { name: /Edit trip/i })).toHaveAttribute(
      "href",
      "/trips/trip-1/edit",
    );
    expect(screen.getByRole("button", { name: /Cancel trip/i })).toBeInTheDocument();
  });

  it("hides Cancel button when trip is terminal", () => {
    render(
      <OverviewActionStrip
        tripId="trip-1"
        isCaptain={true}
        isTerminal={true}
        memberCount={3}
        onCancelled={() => Promise.resolve()}
      />,
    );
    expect(screen.getByRole("link", { name: /Edit trip/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel trip/i })).toBeNull();
  });

  it("keeps the cancel dialog open when cancel fails", async () => {
    vi.mocked(bffCancelTrip).mockRejectedValueOnce(new Error("failed"));
    const onCancelled = vi.fn(() => Promise.resolve());

    render(
      <OverviewActionStrip
        tripId="trip-1"
        isCaptain={true}
        isTerminal={false}
        memberCount={3}
        onCancelled={onCancelled}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Cancel trip/i }));
    expect(await screen.findByText("Cancel this trip?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Yes, cancel/i }));

    await waitFor(() => expect(bffCancelTrip).toHaveBeenCalledWith("trip-1"));
    expect(onCancelled).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Could not cancel the trip. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Cancel this trip?")).toBeInTheDocument();
  });
});
