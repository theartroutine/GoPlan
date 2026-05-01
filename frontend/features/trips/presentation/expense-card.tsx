"use client";

import { LockKeyhole, UserRound } from "lucide-react";

import type { ExpenseListItem } from "@/features/trips/domain/expenses-types";
import {
  formatExpenseMoney,
  getExpenseFundingPercent,
  getExpenseStatusLabel,
  getExpenseStatusTone,
} from "@/features/trips/domain/expenses-money";
import { cn } from "@/shared/lib/utils";

type ExpenseCardProps = {
  expense: ExpenseListItem;
  selected: boolean;
  onSelect: () => void;
  animationDelay?: number;
};

export function ExpenseCard({ expense, selected, onSelect, animationDelay = 0 }: ExpenseCardProps) {
  const fundingPercent = getExpenseFundingPercent(expense);
  const statusTone = getExpenseStatusTone(expense.status);
  const statusCopy = getExpenseStatusCopy(expense);
  const fundingProgressStyle = getProgressBarStyle(fundingPercent);

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`Open ${expense.title}`}
      onClick={onSelect}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both group w-full min-w-0 overflow-hidden rounded-xl border bg-card p-4 text-left shadow-xs outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        selected && "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/20",
      )}
      style={{ animationDuration: "450ms", animationDelay: `${animationDelay}ms` }}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{expense.title}</h3>
            {expense.locked && (
              <LockKeyhole className="size-3.5 shrink-0 text-muted-foreground" aria-label="Locked" />
            )}
          </div>
          {expense.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {expense.description}
            </p>
          )}
          {expense.locked && (
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              Locked by finalized settlement. Reopen settlement to edit.
            </p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            statusTone === "success" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            statusTone === "warning" && "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            statusTone === "danger" && "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
          )}
        >
          {getExpenseStatusLabel(expense.status)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-muted-foreground">Tổng</p>
          <p className="mt-1 break-words font-semibold tabular-nums">
            {formatExpenseMoney(expense.total_amount, expense.currency_code)}
          </p>
        </div>
        <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-muted-foreground">Đã thu</p>
          <p className="mt-1 break-words font-semibold tabular-nums">
            {formatExpenseMoney(expense.paid_amount, expense.currency_code)}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Funding</span>
          <span className="font-medium tabular-nums">{Math.round(fundingPercent)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out motion-reduce:transition-none",
              statusTone === "success" && "bg-emerald-500",
              statusTone === "warning" && "bg-amber-500",
              statusTone === "danger" && "bg-rose-500",
            )}
            style={fundingProgressStyle}
          />
        </div>
        <p className="mt-2 text-xs font-medium text-muted-foreground">{statusCopy}</p>
      </div>

      <div className="mt-4 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <UserRound className="size-3.5 shrink-0" />
        <span className="truncate">Người thu: {expense.collector.display_name}</span>
      </div>
    </button>
  );
}

function getProgressBarStyle(percent: number) {
  return {
    width: `${percent}%`,
    minWidth: percent > 0 ? "0.25rem" : undefined,
  };
}

function getExpenseStatusCopy(expense: ExpenseListItem): string {
  const currencyCode = expense.currency_code;

  if (expense.status === "UNDERFUNDED") {
    return `Still missing ${formatPlainAmount(expense.missing_amount, currencyCode)} ${currencyCode}.`;
  }

  if (expense.status === "FUNDED") {
    return "Funded exactly.";
  }

  return `Surplus ${formatPlainAmount(expense.surplus_amount, currencyCode)} ${currencyCode} is held by ${expense.collector.display_name}.`;
}

function formatPlainAmount(amount: string, currencyCode: string): string {
  const numericAmount = Number.parseFloat(amount);
  const isZeroDecimal = currencyCode === "VND" || currencyCode === "JPY" || currencyCode === "KRW";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: isZeroDecimal ? 0 : 2,
    maximumFractionDigits: isZeroDecimal ? 0 : 2,
  }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
}
