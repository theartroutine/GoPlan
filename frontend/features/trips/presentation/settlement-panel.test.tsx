import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildSettlementTransfer,
  buildTripSettlement,
} from "@/features/trips/presentation/expenses-test-helpers";

const expensesApiMock = vi.hoisted(() => ({
  markSettlementTransferSent: vi.fn(),
  confirmSettlementTransferReceived: vi.fn(),
}));

vi.mock("@/features/trips/infrastructure/expenses-api", () => expensesApiMock);

import { SettlementPanel } from "@/features/trips/presentation/settlement-panel";

describe("SettlementPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it("lets the payer mark a pending transfer as sent and reloads the dashboard", async () => {
    const onChanged = vi.fn();
    expensesApiMock.markSettlementTransferSent.mockResolvedValueOnce(
      buildSettlementTransfer({ payer_marked_sent_at: "2026-05-01T12:30:00Z" }),
    );

    render(
      <SettlementPanel
        tripId="trip-1"
        settlement={buildTripSettlement()}
        currentUserId="user-payer"
        currencyCode="VND"
        onChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "I sent it" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.queryByRole("button", { name: "I received it" })).toBeNull();

    await waitFor(() => {
      expect(expensesApiMock.markSettlementTransferSent).toHaveBeenCalledWith("trip-1", "transfer-1");
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });

  it("lets the recipient confirm a pending transfer as received and reloads the dashboard", async () => {
    const onChanged = vi.fn();
    expensesApiMock.confirmSettlementTransferReceived.mockResolvedValueOnce(
      buildSettlementTransfer({ recipient_confirmed_at: "2026-05-01T12:35:00Z" }),
    );

    render(
      <SettlementPanel
        tripId="trip-1"
        settlement={buildTripSettlement()}
        currentUserId="user-recipient"
        currencyCode="VND"
        onChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "I received it" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.queryByRole("button", { name: "I sent it" })).toBeNull();

    await waitFor(() => {
      expect(expensesApiMock.confirmSettlementTransferReceived).toHaveBeenCalledWith(
        "trip-1",
        "transfer-1",
      );
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });

  it("does not show transfer actions to non-parties", () => {
    render(
      <SettlementPanel
        tripId="trip-1"
        settlement={buildTripSettlement()}
        currentUserId="user-captain"
        currencyCode="VND"
        onChanged={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "I sent it" })).toBeNull();
    expect(screen.queryByRole("button", { name: "I received it" })).toBeNull();
    expect(screen.getByText("Tracking")).not.toBeNull();
  });

  it("renders completed sent and received states without actions", () => {
    render(
      <SettlementPanel
        tripId="trip-1"
        settlement={buildTripSettlement({
          transfers: [
            buildSettlementTransfer({
              payer_marked_sent_at: "2026-05-01T12:30:00Z",
              recipient_confirmed_at: "2026-05-01T12:35:00Z",
            }),
          ],
        })}
        currentUserId="user-payer"
        currencyCode="VND"
        onChanged={vi.fn()}
      />,
    );

    expect(screen.getByText("Sent")).not.toBeNull();
    expect(screen.getByText("Received")).not.toBeNull();
    const completedRow = screen.getByText("Payer User").closest("article");
    expect(completedRow?.getAttribute("data-confirmed")).toBe("true");
    expect(screen.queryByRole("button", { name: "I sent it" })).toBeNull();
    expect(screen.queryByRole("button", { name: "I received it" })).toBeNull();
  });

  it("shows exact sent and recipient-ready guidance for in-progress transfers", () => {
    const settlement = buildTripSettlement({
      transfers: [
        buildSettlementTransfer({
          payer_marked_sent_at: "2026-05-01T12:30:00Z",
          recipient_confirmed_at: null,
        }),
      ],
    });

    const { rerender } = render(
      <SettlementPanel
        tripId="trip-1"
        settlement={settlement}
        currentUserId="user-payer"
        currencyCode="VND"
        onChanged={vi.fn()}
      />,
    );

    expect(screen.getByText("Waiting for Recipient User to confirm receipt.")).not.toBeNull();

    rerender(
      <SettlementPanel
        tripId="trip-1"
        settlement={settlement}
        currentUserId="user-recipient"
        currencyCode="VND"
        onChanged={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Payer User marked this as sent. Confirm only after the money arrives."),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "I received it" })).not.toBeNull();
  });

  it("renders an inline error when a settlement action fails", async () => {
    expensesApiMock.markSettlementTransferSent.mockRejectedValueOnce(new Error("Network error"));

    render(
      <SettlementPanel
        tripId="trip-1"
        settlement={buildTripSettlement()}
        currentUserId="user-payer"
        currencyCode="VND"
        onChanged={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "I sent it" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Could not update the transfer. Try again later.")).not.toBeNull();
  });

  it("keeps each in-flight transfer action disabled while other transfers are submitted", () => {
    expensesApiMock.markSettlementTransferSent.mockImplementation(
      () => new Promise(() => {}),
    );

    render(
      <SettlementPanel
        tripId="trip-1"
        settlement={buildTripSettlement({
          transfers: [
            buildSettlementTransfer({ id: "transfer-a" }),
            buildSettlementTransfer({
              id: "transfer-b",
              recipient: {
                id: "user-recipient-b",
                display_name: "Second Recipient",
                identify_tag: "@second",
              },
            }),
          ],
        })}
        currentUserId="user-payer"
        currencyCode="VND"
        onChanged={vi.fn()}
      />,
    );

    const [transferAButton, transferBButton] = screen.getAllByRole("button", {
      name: "I sent it",
    });

    fireEvent.click(transferAButton);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    fireEvent.click(transferBButton);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(transferAButton.hasAttribute("disabled")).toBe(true);

    fireEvent.click(transferAButton);

    expect(expensesApiMock.markSettlementTransferSent).toHaveBeenCalledTimes(2);
    expect(expensesApiMock.markSettlementTransferSent).toHaveBeenNthCalledWith(
      1,
      "trip-1",
      "transfer-a",
    );
    expect(expensesApiMock.markSettlementTransferSent).toHaveBeenNthCalledWith(
      2,
      "trip-1",
      "transfer-b",
    );
  });
});
