"use client";

import { CircleDollarSign, PiggyBank, Scale, TrendingDown, TrendingUp } from "lucide-react";

import type { ExpenseDashboardResponse } from "@/features/trips/domain/expenses-types";
import {
  summarizeExpenseDashboard,
  type ExpenseDashboardMoneySummary,
} from "@/features/trips/domain/expenses-money";
import { cn } from "@/shared/lib/utils";

type ExpenseSummaryStripProps = {
  dashboard: ExpenseDashboardResponse;
};

type SummaryMetric = {
  label: string;
  value: string;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
};

export function ExpenseSummaryStrip({ dashboard }: ExpenseSummaryStripProps) {
  const summary = summarizeExpenseDashboard(dashboard);
  const metrics = getSummaryMetrics(summary);

  return (
    <section className="space-y-4" aria-label="Expense summary">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;

          return (
            <div
              key={metric.label}
              className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-foreground/20"
              style={{ animationDelay: `${index * 55}ms`, animationDuration: "420ms" }}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="mt-2 truncate text-lg font-semibold text-foreground">
                    {metric.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.helper}</p>
                </div>
                <span
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
                    metric.tone,
                  )}
                >
                  <Icon className="size-4" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Tiến độ thu tiền</p>
            <p className="text-xs text-muted-foreground">
              {summary.formattedPaid} / {summary.formattedTotal}
            </p>
          </div>
          <p className="text-sm font-semibold tabular-nums">{Math.round(summary.fundingPercent)}%</p>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-linear-to-r from-emerald-500 via-sky-500 to-amber-400 shadow-[0_0_18px_rgba(14,165,233,0.28)] transition-all duration-700 ease-out motion-safe:animate-pulse"
            style={{ width: `${summary.fundingPercent}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function getSummaryMetrics(summary: ExpenseDashboardMoneySummary): SummaryMetric[] {
  return [
    {
      label: "Tổng chi phí",
      value: summary.formattedTotal,
      helper: summary.currencyCode,
      icon: CircleDollarSign,
      tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    },
    {
      label: "Đã thu",
      value: summary.formattedPaid,
      helper: "Tổng tiền đã đóng",
      icon: PiggyBank,
      tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Còn thiếu",
      value: summary.formattedMissing,
      helper: "Cần thu thêm",
      icon: TrendingDown,
      tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    },
    {
      label: "Đóng dư",
      value: summary.formattedSurplus,
      helper: "Cần đối soát",
      icon: TrendingUp,
      tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    },
    {
      label: "Số dư của tôi",
      value: summary.myBalanceLabel,
      helper: "Theo ledger hiện tại",
      icon: Scale,
      tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    },
  ];
}
