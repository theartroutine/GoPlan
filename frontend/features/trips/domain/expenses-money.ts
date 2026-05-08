import type {
  ExpenseDashboardResponse,
  ExpenseMoneySummary,
  ExpenseStatus,
  SettlementTransfer,
} from "@/features/trips/domain/expenses-types";
import {
  DEFAULT_TRIP_CURRENCY,
  getTripCurrencyOption,
  isZeroDecimalTripCurrency,
  normalizeCurrencyCode,
} from "@/features/trips/domain/money";

type ExpenseFundingAmounts = Pick<ExpenseMoneySummary, "paid_amount" | "total_amount">;

export type NormalizedExpenseMoneyInput = {
  value: string | null;
  error: string | null;
};

export type ExpenseStatusTone = "warning" | "success" | "danger";

export type MyBalanceDirection = "owe" | "receive" | "balanced";

export type ExpenseDashboardMoneySummary = {
  currencyCode: string;
  formattedTotal: string;
  formattedPaid: string;
  formattedMissing: string;
  formattedSurplus: string;
  fundingPercent: number;
  myBalanceLabel: string;
  myBalanceFormatted: string;
  myBalanceDirection: MyBalanceDirection;
  mySurplusHeld: string;
  hasSurplusHeld: boolean;
};

export function formatExpenseMoney(
  amount: string | number,
  currencyCode: string,
): string {
  const numericAmount = parseMoneyAmount(amount);
  const normalizedCurrencyCode = normalizeCurrencyCode(currencyCode) || DEFAULT_TRIP_CURRENCY;
  const formatOption = getTripCurrencyOption(normalizedCurrencyCode);
  const locale = formatOption?.locale ?? "en-US";
  const maximumFractionDigits = formatOption?.maximumFractionDigits ?? 2;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: normalizedCurrencyCode,
      minimumFractionDigits: maximumFractionDigits,
      maximumFractionDigits,
    }).format(numericAmount);
  } catch {
    return `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numericAmount)} ${normalizedCurrencyCode}`;
  }
}

export function normalizeExpenseMoneyInput(
  value: string,
  currencyCode: string,
): NormalizedExpenseMoneyInput {
  const trimmedValue = value.trim();
  const normalizedCurrencyCode = normalizeCurrencyCode(currencyCode) || DEFAULT_TRIP_CURRENCY;

  if (!trimmedValue) return { value: null, error: "Amount is required." };

  if (isZeroDecimalTripCurrency(normalizedCurrencyCode)) {
    return normalizeZeroDecimalMoneyInput(trimmedValue);
  }

  return normalizeDecimalMoneyInput(trimmedValue);
}

export function getExpenseFundingPercent(expenseOrAmounts: ExpenseFundingAmounts): number {
  const paidAmount = parseMoneyAmount(expenseOrAmounts.paid_amount);
  const totalAmount = parseMoneyAmount(expenseOrAmounts.total_amount);

  if (totalAmount <= 0) return 0;

  return clampPercent((paidAmount / totalAmount) * 100);
}

export function getExpenseStatusLabel(status: ExpenseStatus): string {
  return EXPENSE_STATUS_LABELS[status];
}

export function getExpenseStatusTone(status: ExpenseStatus): ExpenseStatusTone {
  return EXPENSE_STATUS_TONES[status];
}

export function getUserBalanceLabel(
  balance: string,
  currencyCode: string,
): string {
  const numericBalance = parseMoneyAmount(balance);

  if (numericBalance < 0) {
    return `You owe ${formatExpenseMoney(Math.abs(numericBalance), currencyCode)}`;
  }

  if (numericBalance > 0) {
    return `You are owed ${formatExpenseMoney(numericBalance, currencyCode)}`;
  }

  return "Settled";
}

export type SettlementTransferRoleState = {
  isPayer: boolean;
  isRecipient: boolean;
  isSent: boolean;
  isReceived: boolean;
  canMarkSent: boolean;
  canConfirmReceived: boolean;
  actionLabel: string | null;
};

export function getSettlementTransferRoleState(
  transfer: SettlementTransfer,
  currentUserId: string,
): SettlementTransferRoleState {
  const isPayer = transfer.payer.id === currentUserId;
  const isRecipient = transfer.recipient.id === currentUserId;
  const isSent = Boolean(transfer.payer_marked_sent_at);
  const isReceived = Boolean(transfer.recipient_confirmed_at);
  const canMarkSent = isPayer && !isSent;
  const canConfirmReceived = isRecipient && isSent && !isReceived;

  return {
    isPayer,
    isRecipient,
    isSent,
    isReceived,
    canMarkSent,
    canConfirmReceived,
    actionLabel: getSettlementActionLabel({ canMarkSent, canConfirmReceived }),
  };
}

export function summarizeExpenseDashboard(
  response: ExpenseDashboardResponse,
): ExpenseDashboardMoneySummary {
  const currencyCode = response.currency_code || DEFAULT_TRIP_CURRENCY;
  const myBalanceNum = parseMoneyAmount(response.my_balance.balance);
  const mySurplusNum = parseMoneyAmount(response.my_balance.surplus_held ?? "0");

  return {
    currencyCode,
    formattedTotal: formatExpenseMoney(response.summary.total_amount, currencyCode),
    formattedPaid: formatExpenseMoney(response.summary.paid_amount, currencyCode),
    formattedMissing: formatExpenseMoney(response.summary.missing_amount, currencyCode),
    formattedSurplus: formatExpenseMoney(response.summary.surplus_amount, currencyCode),
    fundingPercent: getExpenseFundingPercent(response.summary),
    myBalanceLabel: getUserBalanceLabel(response.my_balance.balance, currencyCode),
    myBalanceFormatted: formatExpenseMoney(Math.abs(myBalanceNum), currencyCode),
    myBalanceDirection: myBalanceNum < 0 ? "owe" : myBalanceNum > 0 ? "receive" : "balanced",
    mySurplusHeld: formatExpenseMoney(mySurplusNum, currencyCode),
    hasSurplusHeld: mySurplusNum > 0,
  };
}

const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  UNDERFUNDED: "Underfunded",
  FUNDED: "Funded",
  OVERFUNDED: "Overfunded",
};

const EXPENSE_STATUS_TONES: Record<ExpenseStatus, ExpenseStatusTone> = {
  UNDERFUNDED: "warning",
  FUNDED: "success",
  OVERFUNDED: "danger",
};

function parseMoneyAmount(amount: string | number): number {
  const numericAmount = typeof amount === "number" ? amount : Number.parseFloat(amount);
  return Number.isFinite(numericAmount) ? numericAmount : 0;
}

function normalizeZeroDecimalMoneyInput(value: string): NormalizedExpenseMoneyInput {
  const groups = value.split(/[.,\s]+/);
  if (groups.some((group) => group === "" || !/^\d+$/.test(group))) {
    return { value: null, error: "Invalid amount." };
  }

  if (groups.length === 1) return { value: groups[0], error: null };

  const [firstGroup, ...restGroups] = groups;
  const isValidGroupedInput =
    firstGroup.length >= 1 &&
    firstGroup.length <= 3 &&
    restGroups.every((group) => group.length === 3);

  if (!isValidGroupedInput) return { value: null, error: "Invalid amount." };

  return { value: groups.join(""), error: null };
}

function normalizeDecimalMoneyInput(value: string): NormalizedExpenseMoneyInput {
  const decimalMoneyPattern = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;

  if (!decimalMoneyPattern.test(value)) {
    return { value: null, error: "Invalid amount." };
  }

  return { value: value.replace(/,/g, ""), error: null };
}

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;

  return Math.min(100, Math.max(0, percent));
}

function getSettlementActionLabel({
  canMarkSent,
  canConfirmReceived,
}: Pick<SettlementTransferRoleState, "canMarkSent" | "canConfirmReceived">): string | null {
  if (canMarkSent) return "I sent it";
  if (canConfirmReceived) return "I received it";

  return null;
}
