import Link from "next/link";
import { Banknote, Coins, DollarSign, PiggyBank, Wallet } from "lucide-react";

import { formatTripMoneyAmount } from "@/features/trips/domain/money";

type Props = {
  tripId: string;
  budgetEstimate: string | null;
  currencyCode: string;
  memberCount: number;
};

function MoneyPattern() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <Coins className="absolute -right-3 top-2 size-14 -rotate-12 text-emerald-400/20" />
      <DollarSign className="absolute left-3 top-6 size-7 rotate-12 text-amber-500/30" />
      <Banknote className="absolute bottom-3 right-10 size-9 -rotate-6 text-emerald-500/25" />
      <Coins className="absolute -bottom-2 left-2 size-10 rotate-6 text-amber-400/20" />
      <PiggyBank className="absolute right-4 top-1/2 size-8 -translate-y-1/2 rotate-3 text-emerald-300/20" />
      <DollarSign className="absolute bottom-6 left-1/3 size-5 -rotate-12 text-emerald-400/25" />
    </div>
  );
}

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
    <div className="relative h-full overflow-hidden rounded-[inherit] bg-gradient-to-br from-emerald-50 via-white to-amber-50">
      <MoneyPattern />

      <div className="relative space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className={
              hasBudget
                ? "flex size-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-100"
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
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm backdrop-blur-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50"
            >
              + Set a budget
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
