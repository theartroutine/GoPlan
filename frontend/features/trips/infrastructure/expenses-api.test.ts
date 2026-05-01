import { beforeEach, describe, expect, it, vi } from "vitest";

const bffMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("@/shared/http/bff-client", () => ({
  bff: bffMock,
}));

import {
  confirmSettlementTransferReceived,
  createExpense,
  finalizeSettlement,
  getExpenseDetail,
  getExpensesDashboard,
  markSettlementTransferSent,
  reopenSettlement,
  setExpenseContribution,
} from "@/features/trips/infrastructure/expenses-api";

describe("expenses-api", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reads the expenses dashboard through the BFF", async () => {
    const dashboard = {
      currency_code: "USD",
      summary: {
        total_amount: "100.00",
        paid_amount: "80.00",
        missing_amount: "20.00",
        surplus_amount: "0.00",
      },
      permissions: { can_manage_expenses: true },
      my_balance: { balance: "10.00" },
      member_balances: { user_1: { balance: "10.00" } },
      expenses: [],
      settlement: null,
    };
    bffMock.get.mockResolvedValue({ data: dashboard });

    await expect(getExpensesDashboard("trip_1", { signal: new AbortController().signal })).resolves.toBe(dashboard);

    expect(bffMock.get).toHaveBeenCalledWith("/api/trips/trip_1/expenses", {
      signal: expect.any(AbortSignal),
    });
  });

  it("creates an expense and returns the upstream response object", async () => {
    const response = {
      id: "expense_1",
      title: "Hotel",
      description: "",
      total_amount: "100",
      currency_code: "USD",
      locked_at: null,
      created_at: "2026-05-01T00:00:00Z",
    };
    const payload = { title: "Hotel", total_amount: "100.00" };
    bffMock.post.mockResolvedValue({ data: response });

    await expect(createExpense("trip_1", payload)).resolves.toBe(response);

    expect(bffMock.post).toHaveBeenCalledWith("/api/trips/trip_1/expenses", payload);
  });

  it("reads expense detail through the BFF", async () => {
    const detail = {
      id: "expense_1",
      title: "Hotel",
      description: "",
      total_amount: "100",
      paid_amount: "25",
      missing_amount: "75",
      surplus_amount: "0",
      currency_code: "USD",
      status: "UNDERFUNDED",
      collector: { id: "user_1", display_name: "Minh", identify_tag: "@minh" },
      locked: false,
      participants: [
        {
          user_id: "user_1",
          display_name: "Minh",
          identify_tag: "@minh",
          share_amount: "50",
          contributed_amount: "25",
          balance: "-25",
        },
      ],
    };
    bffMock.get.mockResolvedValue({ data: detail });

    await expect(
      getExpenseDetail("trip_1", "expense_1", { signal: new AbortController().signal }),
    ).resolves.toBe(detail);

    expect(bffMock.get).toHaveBeenCalledWith("/api/trips/trip_1/expenses/expense_1", {
      signal: expect.any(AbortSignal),
    });
  });

  it("sets a contribution through the contribution BFF route", async () => {
    const response = { id: "contribution_1", amount: "25.00" };
    const payload = { amount: "25.00" };
    bffMock.patch.mockResolvedValue({ data: response });

    await expect(setExpenseContribution("trip_1", "expense_1", "user_1", payload)).resolves.toBe(response);

    expect(bffMock.patch).toHaveBeenCalledWith(
      "/api/trips/trip_1/expenses/expense_1/contributions/user_1",
      payload,
    );
  });

  it("proxies settlement actions through BFF paths", async () => {
    const settlement = { id: "settlement_1", status: "FINALIZED", finalized_at: "2026-05-01T00:00:00Z", transfers: [] };
    const transfer = { id: "transfer_1", amount: "15.00" };
    bffMock.post
      .mockResolvedValueOnce({ data: settlement })
      .mockResolvedValueOnce({ data: { ...settlement, status: "REOPENED" } })
      .mockResolvedValueOnce({ data: transfer })
      .mockResolvedValueOnce({ data: transfer });

    await expect(finalizeSettlement("trip_1")).resolves.toBe(settlement);
    await expect(reopenSettlement("trip_1")).resolves.toMatchObject({ status: "REOPENED" });
    await expect(markSettlementTransferSent("trip_1", "transfer_1")).resolves.toBe(transfer);
    await expect(confirmSettlementTransferReceived("trip_1", "transfer_1")).resolves.toBe(transfer);

    expect(bffMock.post).toHaveBeenNthCalledWith(1, "/api/trips/trip_1/settlement/finalize");
    expect(bffMock.post).toHaveBeenNthCalledWith(2, "/api/trips/trip_1/settlement/reopen");
    expect(bffMock.post).toHaveBeenNthCalledWith(
      3,
      "/api/trips/trip_1/settlement/transfers/transfer_1/sent",
    );
    expect(bffMock.post).toHaveBeenNthCalledWith(
      4,
      "/api/trips/trip_1/settlement/transfers/transfer_1/received",
    );
  });
});
