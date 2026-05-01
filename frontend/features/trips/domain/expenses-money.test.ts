import { describe, expect, it } from "vitest";

import type { ExpenseDashboardResponse, SettlementTransfer } from "@/features/trips/domain/expenses-types";
import {
  formatExpenseMoney,
  getExpenseFundingPercent,
  getExpenseStatusLabel,
  getSettlementTransferRoleState,
  getUserBalanceLabel,
  normalizeExpenseMoneyInput,
  summarizeExpenseDashboard,
} from "@/features/trips/domain/expenses-money";

const payer = {
  id: "member-payer",
  display_name: "Payer",
  identify_tag: null,
};

const recipient = {
  id: "member-recipient",
  display_name: "Recipient",
  identify_tag: null,
};

function makeTransfer(
  overrides: Partial<SettlementTransfer> = {},
): SettlementTransfer {
  return {
    id: "transfer-1",
    payer,
    recipient,
    amount: "125000",
    payer_marked_sent_at: null,
    recipient_confirmed_at: null,
    ...overrides,
  };
}

describe("expense money helpers", () => {
  it("formats VND and USD values without scientific notation", () => {
    expect(formatExpenseMoney("600000", "VND")).toMatch(/600/);
    expect(formatExpenseMoney("600000", "VND")).toMatch(/[₫đ]/i);
    expect(formatExpenseMoney("-300000", "VND")).not.toMatch(/e\+?/i);

    expect(formatExpenseMoney("10.5", "USD")).toBe("$10.50");
    expect(formatExpenseMoney(0, "USD")).toBe("$0.00");
  });

  it("normalizes zero-decimal currency money input with common grouping separators", () => {
    expect(normalizeExpenseMoneyInput("1.500.000", "VND")).toMatchObject({
      value: "1500000",
      error: null,
    });
    expect(normalizeExpenseMoneyInput("1,500,000", "VND")).toMatchObject({
      value: "1500000",
      error: null,
    });
    expect(normalizeExpenseMoneyInput("1500000", "VND")).toMatchObject({
      value: "1500000",
      error: null,
    });
    expect(normalizeExpenseMoneyInput("1500000.50", "VND")).toMatchObject({
      value: null,
      error: expect.any(String),
    });
  });

  it("normalizes decimal currency money input without stripping decimal separators", () => {
    expect(normalizeExpenseMoneyInput("1,500.50", "USD")).toMatchObject({
      value: "1500.50",
      error: null,
    });
    expect(normalizeExpenseMoneyInput("1500.50", "USD")).toMatchObject({
      value: "1500.50",
      error: null,
    });
    expect(normalizeExpenseMoneyInput("1.500,50", "USD")).toMatchObject({
      value: null,
      error: expect.any(String),
    });
  });

  it("calculates funding percent with clamping and invalid totals", () => {
    expect(getExpenseFundingPercent({ paid_amount: "25", total_amount: "100" })).toBe(25);
    expect(getExpenseFundingPercent({ paid_amount: "150", total_amount: "100" })).toBe(100);
    expect(getExpenseFundingPercent({ paid_amount: "-10", total_amount: "100" })).toBe(0);
    expect(getExpenseFundingPercent({ paid_amount: "25", total_amount: "0" })).toBe(0);
    expect(getExpenseFundingPercent({ paid_amount: "25", total_amount: "not-a-number" })).toBe(0);
  });

  it("returns Vietnamese status labels", () => {
    expect(getExpenseStatusLabel("UNDERFUNDED")).toBe("Chưa đủ tiền");
    expect(getExpenseStatusLabel("FUNDED")).toBe("Đã đủ tiền");
    expect(getExpenseStatusLabel("OVERFUNDED")).toBe("Đóng dư");
  });

  it("describes the current user's balance direction", () => {
    expect(getUserBalanceLabel("-300000", "VND")).toContain("Cần trả");
    expect(getUserBalanceLabel("-300000", "VND")).toMatch(/[₫đ]/i);

    expect(getUserBalanceLabel("150000", "VND")).toContain("Được nhận");
    expect(getUserBalanceLabel("0", "VND")).toBe("Đã cân bằng");
  });

  it("returns settlement role actions for payer and recipient only", () => {
    expect(getSettlementTransferRoleState(makeTransfer(), payer.id)).toMatchObject({
      isPayer: true,
      isRecipient: false,
      isSent: false,
      isReceived: false,
      canMarkSent: true,
      canConfirmReceived: false,
      actionLabel: "I've sent",
    });

    expect(getSettlementTransferRoleState(makeTransfer(), recipient.id)).toMatchObject({
      isPayer: false,
      isRecipient: true,
      canMarkSent: false,
      canConfirmReceived: true,
      actionLabel: "Đã nhận",
    });

    expect(
      getSettlementTransferRoleState(
        makeTransfer({
          payer_marked_sent_at: "2026-05-01T09:00:00Z",
          recipient_confirmed_at: "2026-05-01T10:00:00Z",
        }),
        payer.id,
      ),
    ).toMatchObject({
      isSent: true,
      isReceived: true,
      canMarkSent: false,
      canConfirmReceived: false,
      actionLabel: null,
    });

    expect(getSettlementTransferRoleState(makeTransfer(), "captain")).toMatchObject({
      isPayer: false,
      isRecipient: false,
      canMarkSent: false,
      canConfirmReceived: false,
      actionLabel: null,
    });
  });

  it("summarizes dashboard money using the dashboard currency", () => {
    const response: ExpenseDashboardResponse = {
      currency_code: "USD",
      summary: {
        total_amount: "500.50",
        paid_amount: "250.25",
        missing_amount: "250.25",
        surplus_amount: "0",
      },
      permissions: { can_manage_expenses: true },
      my_balance: { balance: "-250.25" },
      member_balances: {},
      expenses: [],
      settlement: null,
    };

    expect(summarizeExpenseDashboard(response)).toMatchObject({
      currencyCode: "USD",
      formattedTotal: "$500.50",
      fundingPercent: 50,
      myBalanceLabel: expect.stringContaining("Cần trả"),
    });
  });
});
