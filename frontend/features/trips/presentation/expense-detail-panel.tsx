"use client";

import { LockKeyhole, ReceiptText, UserRound } from "lucide-react";

import type { ExpenseListItem } from "@/features/trips/domain/expenses-types";
import {
  formatExpenseMoney,
  getExpenseFundingPercent,
  getExpenseStatusLabel,
} from "@/features/trips/domain/expenses-money";

type ExpenseDetailPanelProps = {
  expense: ExpenseListItem | null;
};

export function ExpenseDetailPanel({ expense }: ExpenseDetailPanelProps) {
  if (!expense) {
    return (
      <aside className="rounded-xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
        Chọn một khoản chi để xem chi tiết.
      </aside>
    );
  }

  const fundingPercent = getExpenseFundingPercent(expense);
  const breakdown = [
    { label: "Tổng cần thu", value: formatExpenseMoney(expense.total_amount, expense.currency_code) },
    { label: "Đã thu", value: formatExpenseMoney(expense.paid_amount, expense.currency_code) },
    { label: "Còn thiếu", value: formatExpenseMoney(expense.missing_amount, expense.currency_code) },
    { label: "Đóng dư", value: formatExpenseMoney(expense.surplus_amount, expense.currency_code) },
  ];

  return (
    <aside className="animate-in rounded-xl border border-border bg-card p-5 shadow-xs fade-in-0 slide-in-from-right-2 fill-mode-both">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <ReceiptText className="size-4 shrink-0 text-primary" />
            <h2 className="truncate text-base font-semibold">{expense.title}</h2>
          </div>
          {expense.description && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {expense.description}
            </p>
          )}
        </div>
        {expense.locked && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            <LockKeyhole className="size-3" />
            Locked
          </span>
        )}
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-border">
        {breakdown.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
          >
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <span className="text-sm font-semibold tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg bg-muted/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{expense.collector.display_name}</p>
              {expense.collector.identify_tag && (
                <p className="truncate text-xs text-muted-foreground">
                  {expense.collector.identify_tag}
                </p>
              )}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-background px-2 py-1 text-xs font-medium text-muted-foreground">
            Người thu
          </span>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">{getExpenseStatusLabel(expense.status)}</span>
          <span className="font-semibold tabular-nums">{Math.round(fundingPercent)}%</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-linear-to-r from-sky-500 via-emerald-500 to-amber-400 transition-all duration-700 ease-out"
            style={{ width: `${fundingPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Chi tiết đóng góp theo từng thành viên sẽ được hiển thị khi API trả dữ liệu contribution ở task sau.
      </div>
    </aside>
  );
}
