import type {
  ExpenseDashboardResponse,
  ExpenseMoneySummary,
  ExpenseStatus,
  SettlementTransfer,
} from "@/features/trips/domain/expenses-types";
import { DEFAULT_TRIP_CURRENCY, normalizeCurrencyCode } from "@/features/trips/domain/money";

type ExpenseFundingAmounts = Pick<ExpenseMoneySummary, "paid_amount" | "total_amount">;

type CurrencyFormatOption = {
  locale: string;
  minimumFractionDigits: number;
  maximumFractionDigits: number;
};

const CURRENCY_FORMAT_OPTIONS: Record<string, CurrencyFormatOption> = {
  VND: {
    locale: "vi-VN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  },
  USD: {
    locale: "en-US",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  },
};

export type ExpenseStatusTone = "warning" | "success" | "danger";

export type ExpenseDashboardMoneySummary = {
  currencyCode: string;
  formattedTotal: string;
  formattedPaid: string;
  formattedMissing: string;
  formattedSurplus: string;
  fundingPercent: number;
  myBalanceLabel: string;
};

export function formatExpenseMoney(
  amount: string | number,
  currencyCode: string,
): string {
  const numericAmount = parseMoneyAmount(amount);
  const normalizedCurrencyCode = normalizeCurrencyCode(currencyCode) || DEFAULT_TRIP_CURRENCY;
  const formatOption = CURRENCY_FORMAT_OPTIONS[normalizedCurrencyCode] ?? {
    locale: "en-US",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  };

  try {
    return new Intl.NumberFormat(formatOption.locale, {
      style: "currency",
      currency: normalizedCurrencyCode,
      minimumFractionDigits: formatOption.minimumFractionDigits,
      maximumFractionDigits: formatOption.maximumFractionDigits,
    }).format(numericAmount);
  } catch {
    return `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numericAmount)} ${normalizedCurrencyCode}`;
  }
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
    return `Cần trả ${formatExpenseMoney(Math.abs(numericBalance), currencyCode)}`;
  }

  if (numericBalance > 0) {
    return `Được nhận ${formatExpenseMoney(numericBalance, currencyCode)}`;
  }

  return "Đã cân bằng";
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
  const canConfirmReceived = isRecipient && !isReceived;

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
  const currencyCode = response.expenses[0]?.currency_code || DEFAULT_TRIP_CURRENCY;

  return {
    currencyCode,
    formattedTotal: formatExpenseMoney(response.summary.total_amount, currencyCode),
    formattedPaid: formatExpenseMoney(response.summary.paid_amount, currencyCode),
    formattedMissing: formatExpenseMoney(response.summary.missing_amount, currencyCode),
    formattedSurplus: formatExpenseMoney(response.summary.surplus_amount, currencyCode),
    fundingPercent: getExpenseFundingPercent(response.summary),
    myBalanceLabel: getUserBalanceLabel(response.my_balance.balance, currencyCode),
  };
}

const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  UNDERFUNDED: "Chưa đủ tiền",
  FUNDED: "Đã đủ tiền",
  OVERFUNDED: "Đóng dư",
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

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;

  return Math.min(100, Math.max(0, percent));
}

function getSettlementActionLabel({
  canMarkSent,
  canConfirmReceived,
}: Pick<SettlementTransferRoleState, "canMarkSent" | "canConfirmReceived">): string | null {
  if (canMarkSent) return "I've sent";
  if (canConfirmReceived) return "Đã nhận";

  return null;
}
