"use client";

import {
  formatBudgetInputValue,
  isVndCurrency,
  normalizeBudgetInput,
} from "@/features/trips/domain/money";
import { Input } from "@/shared/ui/input";

type Props = {
  id: string;
  value: string;
  currencyCode: string;
  onChange: (value: string) => void;
};

export function BudgetEstimateInput({ id, value, currencyCode, onChange }: Props) {
  const isVnd = isVndCurrency(currencyCode);
  const displayValue = formatBudgetInputValue(value, currencyCode);

  return (
    <Input
      id={id}
      type="text"
      inputMode={isVnd ? "numeric" : "decimal"}
      min="0"
      value={displayValue}
      onChange={(event) => {
        onChange(normalizeBudgetInput(event.target.value, currencyCode));
      }}
      placeholder={isVnd ? "5.000.000" : "5000000.00"}
    />
  );
}
