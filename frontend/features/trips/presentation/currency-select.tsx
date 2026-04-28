"use client";

import { ChevronDown } from "lucide-react";

import { getTripCurrencyOptions } from "@/features/trips/domain/money";
import { cn } from "@/shared/lib/utils";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
};

export function CurrencySelect({ id, value, onChange }: Props) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-input bg-transparent px-3 py-1 pr-9 text-base shadow-xs outline-none transition-[color,box-shadow] md:text-sm dark:bg-input/30",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
      >
        {getTripCurrencyOptions(value).map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
