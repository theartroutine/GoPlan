"use client";

import { LockKeyhole, ReceiptText, UserRound } from "lucide-react";

import type {
  ExpenseDetailResponse,
  ExpenseListItem,
} from "@/features/trips/domain/expenses-types";
import {
  formatExpenseMoney,
  getExpenseFundingPercent,
  getExpenseStatusLabel,
} from "@/features/trips/domain/expenses-money";
import { ContributionEditor } from "@/features/trips/presentation/contribution-editor";
import { Spinner } from "@/shared/ui/spinner";

type ExpenseDetailPanelProps = {
  expense: ExpenseListItem | null;
  detail: ExpenseDetailResponse | null;
  detailLoading: boolean;
  detailError: string | null;
  tripId: string;
  settlementFinalized: boolean;
  onContributionChanged: () => void | Promise<void>;
};

export function ExpenseDetailPanel({
  expense,
  detail,
  detailLoading,
  detailError,
  tripId,
  settlementFinalized,
  onContributionChanged,
}: ExpenseDetailPanelProps) {
  if (!expense) {
    return (
      <aside className="rounded-xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
        Chọn một khoản chi để xem chi tiết.
      </aside>
    );
  }

  const matchedDetail = detail?.id === expense.id ? detail : null;
  const displayExpense = matchedDetail ?? expense;
  const fundingPercent = getExpenseFundingPercent(displayExpense);
  const breakdown = [
    { label: "Tổng cần thu", value: formatExpenseMoney(displayExpense.total_amount, displayExpense.currency_code) },
    { label: "Đã thu", value: formatExpenseMoney(displayExpense.paid_amount, displayExpense.currency_code) },
    { label: "Còn thiếu", value: formatExpenseMoney(displayExpense.missing_amount, displayExpense.currency_code) },
    { label: "Đóng dư", value: formatExpenseMoney(displayExpense.surplus_amount, displayExpense.currency_code) },
  ];

  return (
    <aside className="animate-in rounded-xl border border-border bg-card p-5 shadow-xs fade-in-0 slide-in-from-right-2 fill-mode-both">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <ReceiptText className="size-4 shrink-0 text-primary" />
            <h2 className="truncate text-base font-semibold">{displayExpense.title}</h2>
          </div>
          {displayExpense.description && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {displayExpense.description}
            </p>
          )}
        </div>
        {displayExpense.locked && (
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
              <p className="truncate text-sm font-medium">{displayExpense.collector.display_name}</p>
              {displayExpense.collector.identify_tag && (
                <p className="truncate text-xs text-muted-foreground">
                  {displayExpense.collector.identify_tag}
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
          <span className="font-medium">{getExpenseStatusLabel(displayExpense.status)}</span>
          <span className="font-semibold tabular-nums">{Math.round(fundingPercent)}%</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-linear-to-r from-sky-500 via-emerald-500 to-amber-400 transition-all duration-700 ease-out"
            style={{ width: `${fundingPercent}%` }}
          />
        </div>
      </div>

      {detailLoading && (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Đang tải chi tiết đóng góp...
        </div>
      )}

      {detailError && (
        <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {detailError}
        </div>
      )}

      {matchedDetail && (
        <ContributionEditor
          detail={matchedDetail}
          tripId={tripId}
          canManageExpenses={matchedDetail.permissions.can_manage_expenses}
          settlementFinalized={settlementFinalized}
          onChanged={onContributionChanged}
        />
      )}
    </aside>
  );
}
