export const DEFAULT_TRIP_CURRENCY = "VND";

export type TripCurrencyOption = {
  code: string;
  label: string;
  locale: string;
  maximumFractionDigits: number;
};

export const TRIP_CURRENCY_OPTIONS: TripCurrencyOption[] = [
  { code: "VND", label: "VND - Vietnamese dong", locale: "vi-VN", maximumFractionDigits: 0 },
  { code: "USD", label: "USD - US dollar", locale: "en-US", maximumFractionDigits: 2 },
  { code: "EUR", label: "EUR - Euro", locale: "de-DE", maximumFractionDigits: 2 },
  { code: "JPY", label: "JPY - Japanese yen", locale: "ja-JP", maximumFractionDigits: 0 },
  { code: "KRW", label: "KRW - Korean won", locale: "ko-KR", maximumFractionDigits: 0 },
  { code: "SGD", label: "SGD - Singapore dollar", locale: "en-SG", maximumFractionDigits: 2 },
  { code: "THB", label: "THB - Thai baht", locale: "th-TH", maximumFractionDigits: 2 },
  { code: "AUD", label: "AUD - Australian dollar", locale: "en-AU", maximumFractionDigits: 2 },
  { code: "GBP", label: "GBP - British pound", locale: "en-GB", maximumFractionDigits: 2 },
  { code: "CAD", label: "CAD - Canadian dollar", locale: "en-CA", maximumFractionDigits: 2 },
];

const CURRENCY_OPTIONS_BY_CODE = new Map(
  TRIP_CURRENCY_OPTIONS.map((option) => [option.code, option]),
);

export function getTripCurrencyOptions(currentCode?: string): TripCurrencyOption[] {
  const normalizedCode = normalizeCurrencyCode(currentCode);
  if (!normalizedCode || CURRENCY_OPTIONS_BY_CODE.has(normalizedCode)) {
    return TRIP_CURRENCY_OPTIONS;
  }

  return [
    {
      code: normalizedCode,
      label: `${normalizedCode} - Current currency`,
      locale: "en-US",
      maximumFractionDigits: 2,
    },
    ...TRIP_CURRENCY_OPTIONS,
  ];
}

export function normalizeCurrencyCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function isVndCurrency(currencyCode: string): boolean {
  return normalizeCurrencyCode(currencyCode) === "VND";
}

export function apiBudgetToInputValue(
  value: string | null | undefined,
  currencyCode: string,
): string {
  const trimmedValue = (value ?? "").trim();
  if (!trimmedValue) return "";

  if (isVndCurrency(currencyCode)) {
    return trimmedValue.split(".")[0].replace(/\D/g, "");
  }

  return normalizeBudgetInput(trimmedValue, currencyCode);
}

export function normalizeBudgetInput(value: string, currencyCode: string): string {
  if (isVndCurrency(currencyCode)) {
    return value.replace(/\D/g, "");
  }

  return normalizeDecimalBudgetInput(value);
}

export function normalizeBudgetInputForCurrencyChange(
  value: string,
  nextCurrencyCode: string,
): string {
  if (isVndCurrency(nextCurrencyCode)) {
    return value.split(".")[0].replace(/\D/g, "");
  }

  return normalizeBudgetInput(value, nextCurrencyCode);
}

export function budgetInputToPayload(value: string, currencyCode: string): string {
  const normalizedValue = normalizeBudgetInput(value, currencyCode);
  if (!normalizedValue) return "";

  if (isVndCurrency(currencyCode)) {
    return normalizedValue;
  }

  return normalizedValue.endsWith(".")
    ? normalizedValue.slice(0, -1)
    : normalizedValue;
}

export function formatBudgetInputValue(value: string, currencyCode: string): string {
  if (!isVndCurrency(currencyCode)) {
    return value;
  }

  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function formatTripMoneyAmount(
  value: string | number | null | undefined,
  currencyCode: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;

  const numericValue = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(numericValue)) return null;

  const currencyOption = CURRENCY_OPTIONS_BY_CODE.get(normalizeCurrencyCode(currencyCode));
  const locale = currencyOption?.locale ?? "en-US";
  const maximumFractionDigits = currencyOption?.maximumFractionDigits ?? 2;

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(numericValue);
}

function normalizeDecimalBudgetInput(value: string): string {
  const cleanedValue = value.replace(/[^\d.]/g, "");
  if (!cleanedValue) return "";

  const hasDecimalPoint = cleanedValue.includes(".");
  const [integerPart = "", ...decimalParts] = cleanedValue.split(".");
  const normalizedInteger = normalizeIntegerPart(integerPart);

  if (!hasDecimalPoint) {
    return normalizedInteger;
  }

  const decimalPart = decimalParts.join("").slice(0, 2);
  return `${normalizedInteger || "0"}.${decimalPart}`;
}

function normalizeIntegerPart(value: string): string {
  const digits = value.replace(/\D/g, "");
  const withoutLeadingZeroes = digits.replace(/^0+(?=\d)/, "");
  return withoutLeadingZeroes;
}
