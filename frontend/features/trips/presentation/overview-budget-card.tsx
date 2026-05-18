import { Wallet } from "lucide-react";

import { formatTripMoneyAmount } from "@/features/trips/domain/money";

type Props = {
  budgetEstimate: string | null;
  currencyCode: string;
  memberCount: number;
};

export function OverviewBudgetCard({
  budgetEstimate,
  currencyCode,
  memberCount,
}: Props) {
  if (!budgetEstimate) return null;
  const total = formatTripMoneyAmount(budgetEstimate, currencyCode);
  if (!total) return null;
  const perPerson =
    memberCount > 0
      ? formatTripMoneyAmount(parseFloat(budgetEstimate) / memberCount, currencyCode)
      : null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <Wallet aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight">
            {total} {currencyCode}
          </p>
          {perPerson && (
            <p className="text-xs text-muted-foreground">
              ~{perPerson} {currencyCode} per person
            </p>
          )}
        </div>
      </div>

      <div
        aria-hidden="true"
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full w-full opacity-50"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, var(--muted-foreground) 0 6px, transparent 6px 12px)",
            backgroundSize: "16px 16px",
          }}
        />
      </div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Estimate · actual spending coming soon
      </p>
    </div>
  );
}
