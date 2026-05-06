"use client";

import { LockKeyhole, Pencil, Trash2 } from "lucide-react";

import type {
  ExpenseDetailResponse,
  ExpenseListItem,
} from "@/features/trips/domain/expenses-types";
import {
  formatExpenseMoney,
  getExpenseFundingPercent,
  getExpenseStatusLabel,
  getExpenseStatusTone,
} from "@/features/trips/domain/expenses-money";
import { ContributionEditor } from "@/features/trips/presentation/contribution-editor";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

type ExpenseDetailPanelProps = {
  className?: string;
  expense: ExpenseListItem | null;
  detail: ExpenseDetailResponse | null;
  detailLoading: boolean;
  detailError: string | null;
  tripId: string;
  settlementFinalized: boolean;
  onContributionChanged: (expenseId: string) => void | Promise<void>;
  onEditExpense: (expense: ExpenseListItem | ExpenseDetailResponse) => void;
  onDeleteExpense: (expense: ExpenseListItem | ExpenseDetailResponse) => void;
};

export function ExpenseDetailPanel({
  className,
  expense,
  detail,
  detailLoading,
  detailError,
  tripId,
  settlementFinalized,
  onContributionChanged,
  onEditExpense,
  onDeleteExpense,
}: ExpenseDetailPanelProps) {
  if (!expense) {
    return (
      <aside
        aria-label="Expense details"
        className={cn(
          "flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border bg-card",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">Select an expense to view details.</p>
      </aside>
    );
  }

  const matchedDetail = detail?.id === expense.id ? detail : null;
  const displayExpense = matchedDetail ?? expense;
  const fundingPercent = getExpenseFundingPercent(displayExpense);
  const statusTone = getExpenseStatusTone(displayExpense.status);
  const isLocked = displayExpense.locked || settlementFinalized;
  const canManageExpense = matchedDetail?.permissions.can_manage_expenses ?? false;
  const canMutateExpense = canManageExpense && !isLocked;
  const missingAmt = Number.parseFloat(displayExpense.missing_amount);
  const surplusAmt = Number.parseFloat(displayExpense.surplus_amount);
  const contributionGuidance = matchedDetail
    ? getContributionGuidance(matchedDetail)
    : null;

  return (
    <aside
      aria-label="Expense details"
      className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}
    >
      {/* Animate on mount and re-animate when expense changes */}
      <div key={expense.id} className="animate-in fade-in-0 duration-200">

        {/* ── Header ── */}
        <div className="flex min-w-0 items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Expense details
            </p>
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
              <h2
                aria-label={`Details for ${displayExpense.title}`}
                className="truncate text-lg font-semibold leading-tight text-foreground"
              >
                {displayExpense.title}
              </h2>
              {isLocked && (
                <LockKeyhole
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-label="Locked"
                />
              )}
            </div>
            {displayExpense.description && (
              <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                {displayExpense.description}
              </p>
            )}
          </div>
          {canMutateExpense && (
            <div className="flex shrink-0 gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Edit expense"
                onClick={() => onEditExpense(displayExpense)}
              >
                <Pencil className="size-3.5" />
                Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label="Delete expense"
                onClick={() => onDeleteExpense(displayExpense)}
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            </div>
          )}
        </div>

        {/* ── Locked notice ── */}
        {isLocked && (
          <div className="border-t border-border bg-muted/30 px-5 py-2">
            <p className="text-[11px] text-muted-foreground">
              Settlement is finalized. Reopen it before editing expenses or contributions.
            </p>
          </div>
        )}

        {/* ── Financial overview ── */}
        <div className="border-t border-border px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Finance
            </p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
                statusTone === "success" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                statusTone === "warning" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                statusTone === "danger" && "bg-rose-500/10 text-rose-700 dark:text-rose-300",
              )}
            >
              {getExpenseStatusLabel(displayExpense.status)}
            </span>
          </div>

          {/* Key numbers */}
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground/70">Total to collect</p>
              <p className="mt-0.5 text-base font-bold tabular-nums tracking-tight text-foreground">
                {formatExpenseMoney(displayExpense.total_amount, displayExpense.currency_code)}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/50">
                {displayExpense.currency_code}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground/70">Collected</p>
              <p className="mt-0.5 text-base font-bold tabular-nums tracking-tight text-foreground">
                {formatExpenseMoney(displayExpense.paid_amount, displayExpense.currency_code)}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/50">Total contributions</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Collection progress
              </p>
              <span className="text-[11px] font-semibold tabular-nums text-foreground">
                {Math.round(fundingPercent)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700 ease-out",
                  fundingPercent >= 100
                    ? "bg-emerald-500"
                    : fundingPercent > 0
                      ? "bg-foreground/50"
                      : "bg-transparent",
                )}
                style={{
                  width: `${Math.min(fundingPercent, 100)}%`,
                  minWidth: fundingPercent > 0 ? "4px" : undefined,
                }}
              />
            </div>
          </div>

          {/* Conditional status pills */}
          {(missingAmt > 0 || surplusAmt > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {missingAmt > 0 && (
                <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  Missing&nbsp;
                  {formatExpenseMoney(displayExpense.missing_amount, displayExpense.currency_code)}
                </span>
              )}
              {surplusAmt > 0 && (
                <span className="inline-flex items-center rounded-md bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                  Overfunded&nbsp;
                  {formatExpenseMoney(displayExpense.surplus_amount, displayExpense.currency_code)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Collector ── */}
        <div className="border-t border-border px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Collector
          </p>
          <p className="mt-1.5 text-sm font-medium text-foreground">
            {displayExpense.collector.display_name}
          </p>
          {displayExpense.collector.identify_tag && (
            <p className="truncate text-[11px] text-muted-foreground">
              {displayExpense.collector.identify_tag}
            </p>
          )}
        </div>

        {/* ── Guidance ── */}
        {contributionGuidance && (
          <div className="border-t border-border bg-muted/30 px-5 py-3">
            <p className="break-words text-xs leading-relaxed text-muted-foreground">
              {contributionGuidance}
            </p>
          </div>
        )}

        {/* ── Contributions ── */}
        {(detailLoading || matchedDetail || detailError) && (
          <div className="border-t border-border">
            {matchedDetail ? (
              <ContributionEditor
                detail={matchedDetail}
                tripId={tripId}
                canManageExpenses={matchedDetail.permissions.can_manage_expenses}
                settlementFinalized={settlementFinalized}
                onChanged={onContributionChanged}
              />
            ) : detailError ? (
              <p className="px-5 py-3 text-xs text-destructive">{detailError}</p>
            ) : (
              <ContributionSkeleton />
            )}
          </div>
        )}

      </div>
    </aside>
  );
}

function getContributionGuidance(detail: ExpenseDetailResponse): string | null {
  const missingParticipant = detail.participants.find((participant) => {
    const contributedAmount = Number.parseFloat(participant.contributed_amount);
    const shareAmount = Number.parseFloat(participant.share_amount);
    return contributedAmount <= 0 && shareAmount > 0;
  });

  if (missingParticipant) {
    return `${missingParticipant.display_name} has not contributed their share of ${formatExpenseMoney(
      missingParticipant.share_amount,
      detail.currency_code,
    )}.`;
  }

  const coveringParticipant = detail.participants.find(
    (participant) => Number.parseFloat(participant.balance) > 0,
  );

  if (coveringParticipant) {
    return `${coveringParticipant.display_name} is covering ${formatExpenseMoney(
      coveringParticipant.balance,
      detail.currency_code,
    )} for this expense.`;
  }

  return null;
}

function ContributionSkeleton() {
  return (
    <div className="px-5 py-3">
      <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
      <div className="mt-3 divide-y divide-border">
        {[0, 1].map((i) => (
          <div key={i} className="py-2.5">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="mt-2 grid grid-cols-3 gap-x-2">
              {[0, 1, 2].map((j) => (
                <div key={j} className="space-y-1">
                  <div className="h-2.5 w-10 animate-pulse rounded bg-muted" />
                  <div className="h-3.5 w-14 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
