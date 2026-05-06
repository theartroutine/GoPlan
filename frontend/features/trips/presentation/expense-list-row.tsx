"use client";

import { LockKeyhole } from "lucide-react";

import type { ExpenseListItem } from "@/features/trips/domain/expenses-types";
import {
  formatExpenseMoney,
  getExpenseStatusLabel,
  getExpenseStatusTone,
} from "@/features/trips/domain/expenses-money";
import { cn } from "@/shared/lib/utils";

type ExpenseListRowProps = {
  expense: ExpenseListItem;
  selected: boolean;
  onSelect: () => void;
};

export function ExpenseListRow({ expense, selected, onSelect }: ExpenseListRowProps) {
  const tone = getExpenseStatusTone(expense.status);
  const statusMessage = getStatusMessage(expense);

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`Open ${expense.title}`}
      onClick={onSelect}
      className={cn(
        "grid w-full min-w-0 gap-2 border-b border-border px-3 py-3 text-left outline-none transition-colors duration-150 last:border-b-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        "md:grid-cols-[minmax(180px,2fr)_minmax(96px,0.8fr)_minmax(96px,0.8fr)_minmax(112px,0.9fr)_minmax(120px,1fr)] md:items-center",
        selected ? "bg-muted/70" : "bg-card hover:bg-muted/40",
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            tone === "success" && "bg-emerald-500",
            tone === "warning" && "bg-amber-500",
            tone === "danger" && "bg-rose-500",
          )}
        />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{expense.title}</span>
            {expense.locked && (
              <LockKeyhole className="size-3.5 shrink-0 text-muted-foreground" aria-label="Locked" />
            )}
          </div>
          <p
            className={cn(
              "mt-0.5 truncate text-xs",
              tone === "success" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400",
            )}
          >
            {statusMessage}
          </p>
        </div>
      </div>

      <RowMetric label="Total" value={formatExpenseMoney(expense.total_amount, expense.currency_code)} />
      <RowMetric label="Collected" value={formatExpenseMoney(expense.paid_amount, expense.currency_code)} />

      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground md:hidden">Status</p>
        <p
          className={cn(
            "truncate text-sm font-semibold",
            tone === "success" && "text-emerald-700 dark:text-emerald-300",
            tone === "warning" && "text-amber-700 dark:text-amber-300",
            tone === "danger" && "text-rose-700 dark:text-rose-300",
          )}
        >
          {getExpenseStatusLabel(expense.status)}
        </p>
      </div>

      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground md:hidden">Collector</p>
        <p className="truncate text-sm font-medium text-foreground">{expense.collector.display_name}</p>
        {expense.collector.identify_tag && (
          <p className="truncate text-xs text-muted-foreground">{expense.collector.identify_tag}</p>
        )}
      </div>
    </button>
  );
}

function RowMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground md:hidden">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums text-foreground md:text-right">
        {value}
      </p>
    </div>
  );
}

function getStatusMessage(expense: ExpenseListItem): string {
  if (expense.status === "UNDERFUNDED") {
    return `Missing ${formatExpenseMoney(expense.missing_amount, expense.currency_code)}`;
  }
  if (expense.status === "OVERFUNDED") {
    return `Surplus ${formatExpenseMoney(expense.surplus_amount, expense.currency_code)}, needs reconciliation`;
  }
  return expense.description || "Funded";
}
