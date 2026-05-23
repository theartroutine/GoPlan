"use client";

import type { ExpenseDashboardResponse } from "@/features/trips/domain/expenses-types";
import {
  summarizeExpenseDashboard,
  type MyBalanceDirection,
} from "@/features/trips/domain/expenses-money";
import { cn } from "@/shared/lib/utils";

const BALANCE_TONE: Record<
  MyBalanceDirection,
  { amount: string; direction: string }
> = {
  receive: {
    amount: "text-emerald-600 dark:text-emerald-400",
    direction: "text-emerald-600/70 dark:text-emerald-500",
  },
  owe: {
    amount: "text-red-600 dark:text-red-400",
    direction: "text-red-600/70 dark:text-red-500",
  },
  balanced: {
    amount: "text-foreground",
    direction: "text-muted-foreground",
  },
};

const DIRECTION_PREFIX: Record<MyBalanceDirection, string> = {
  receive: "+",
  owe: "−",
  balanced: "",
};

const DIRECTION_LABEL: Record<MyBalanceDirection, string> = {
  receive: "You are owed",
  owe: "You owe",
  balanced: "Settled",
};

export function ExpenseSummaryStrip({ dashboard }: { dashboard: ExpenseDashboardResponse }) {
  const s = summarizeExpenseDashboard(dashboard);
  const tone = BALANCE_TONE[s.myBalanceDirection];

  const stats = [
    { label: "Total expenses", value: s.formattedTotal },
    { label: "Collected", value: s.formattedPaid },
    { label: "Missing", value: s.formattedMissing },
    { label: "Overfunded", value: s.formattedSurplus },
  ] as const;

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-label="Expense summary">
      <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={cn(
              "min-w-0 border-border pl-3",
              i > 0 && "border-l",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-1 truncate text-sm font-semibold tabular-nums tracking-tight text-foreground">
              {stat.value}
            </p>
          </div>
        ))}

        <div className="min-w-0 border-border pl-3 md:border-l">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            My balance
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <p
              className={cn(
                "truncate text-sm font-semibold tabular-nums tracking-tight",
                tone.amount,
              )}
            >
              {DIRECTION_PREFIX[s.myBalanceDirection]}
              {s.myBalanceFormatted}
            </p>
            <p className={cn("text-[11px] font-medium", tone.direction)}>
              {DIRECTION_LABEL[s.myBalanceDirection]}
            </p>
          </div>
          {s.hasSurplusHeld && (
            <p className="mt-1 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
              Holding <span className="font-semibold tabular-nums">{s.mySurplusHeld}</span> in
              group surplus
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Collection progress
          </p>
          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:block">
              {s.formattedPaid} / {s.formattedTotal}
            </span>
            <span className="text-[11px] font-semibold tabular-nums text-foreground">
              {Math.round(s.fundingPercent)}%
            </span>
          </div>
        </div>
        <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground/50 transition-[width] duration-700 ease-out"
            style={{
              width: `${s.fundingPercent}%`,
              minWidth: s.fundingPercent > 0 ? "3px" : undefined,
            }}
          />
        </div>
      </div>
    </section>
  );
}
