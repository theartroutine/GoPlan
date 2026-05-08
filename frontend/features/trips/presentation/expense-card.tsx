"use client";

import { LockKeyhole } from "lucide-react";

import type { ExpenseListItem } from "@/features/trips/domain/expenses-types";
import {
  formatExpenseMoney,
  getExpenseFundingPercent,
  getExpenseStatusTone,
} from "@/features/trips/domain/expenses-money";
import { cn } from "@/shared/lib/utils";

type ExpenseCardProps = {
  expense: ExpenseListItem;
  selected: boolean;
  onSelect: () => void;
};

export function ExpenseCard({ expense, selected, onSelect }: ExpenseCardProps) {
  const fundingPercent = getExpenseFundingPercent(expense);
  const statusTone = getExpenseStatusTone(expense.status);

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`Open ${expense.title}`}
      onClick={onSelect}
      className={cn(
        "group w-full min-w-0 overflow-hidden rounded-lg border bg-card p-3 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        selected ? "border-foreground/20 bg-muted/40" : "border-border hover:bg-muted/40",
      )}
    >
      {/* Title row */}
      <div className="flex min-w-0 items-start gap-2">
        <span
          aria-hidden
          className={cn(
            "mt-[5px] size-1.5 shrink-0 rounded-full",
            statusTone === "success" && "bg-emerald-500",
            statusTone === "warning" && "bg-amber-500",
            statusTone === "danger" && "bg-rose-500",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-sm font-medium text-foreground">{expense.title}</h3>
            {expense.locked && (
              <LockKeyhole className="size-3 shrink-0 text-muted-foreground" aria-label="Locked" />
            )}
          </div>
          {expense.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{expense.description}</p>
          )}
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {formatExpenseMoney(expense.total_amount, expense.currency_code)}
        </span>
      </div>

      {/* Progress */}
      <div className="mt-3 pl-[14px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {formatExpenseMoney(expense.paid_amount, expense.currency_code)} collected
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {Math.round(fundingPercent)}%
          </span>
        </div>
        <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              statusTone === "success" && "bg-emerald-500",
              statusTone === "warning" && "bg-amber-500",
              statusTone === "danger" && "bg-rose-500",
            )}
            style={{
              width: `${fundingPercent}%`,
              minWidth: fundingPercent > 0 ? "3px" : undefined,
            }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">
          Collected by {expense.collector.display_name}
        </p>
      </div>
    </button>
  );
}
