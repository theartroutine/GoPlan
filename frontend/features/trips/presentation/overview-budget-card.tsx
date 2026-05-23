import Link from "next/link";
import type { CSSProperties } from "react";
import { Wallet } from "lucide-react";

import { formatTripMoneyAmount } from "@/features/trips/domain/money";

type Props = {
  tripId: string;
  budgetEstimate: string | null;
  currencyCode: string;
  memberCount: number;
};

const budgetCardBackgroundStyle = {
  backgroundColor: "rgb(248 250 252)",
  backgroundImage:
    "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(248,250,252,0.8)), url('/images/trip-overview/overview-budget-card.webp')",
  backgroundPosition: "center",
  backgroundSize: "cover",
} satisfies CSSProperties;

export function OverviewBudgetCard({
  tripId,
  budgetEstimate,
  currencyCode,
  memberCount,
}: Props) {
  const total = budgetEstimate ? formatTripMoneyAmount(budgetEstimate, currencyCode) : null;
  const perPerson =
    budgetEstimate && memberCount > 0
      ? formatTripMoneyAmount(parseFloat(budgetEstimate) / memberCount, currencyCode)
      : null;
  const hasBudget = Boolean(total);

  return (
    <div className="relative h-full overflow-hidden rounded-[inherit] bg-card">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={budgetCardBackgroundStyle}
      />

      <div className="relative space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className={
              hasBudget
                ? "flex size-10 items-center justify-center rounded-full bg-slate-800 text-white shadow-sm ring-2 ring-white/70"
                : "flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-border"
            }
          >
            <Wallet className="size-5" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Budget
          </p>
        </div>

        {hasBudget ? (
          <div className="space-y-1">
            <p className="text-2xl font-extrabold leading-tight tracking-tight text-foreground">
              {total}{" "}
              <span className="text-sm font-semibold text-muted-foreground">
                {currencyCode}
              </span>
            </p>
            {perPerson ? (
              <p className="text-xs text-muted-foreground">
                ~{perPerson} {currencyCode} per person
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Add members to split per person.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-lg font-semibold italic text-muted-foreground">
              Not set yet
            </p>
            <Link
              href={`/trips/${tripId}/edit`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-white/85 px-3 py-1 text-xs font-semibold text-foreground/75 shadow-sm backdrop-blur-sm transition-colors hover:border-foreground/30 hover:bg-white hover:text-foreground"
            >
              + Set a budget
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
