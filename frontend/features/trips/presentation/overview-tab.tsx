"use client";

import { CalendarDays, Users, Wallet } from "lucide-react";

import {
  formatDateOnly,
  getInclusiveDateOnlySpan,
} from "@/features/trips/domain/date-only";
import { formatTripMoneyAmount } from "@/features/trips/domain/money";
import { useTripContext } from "@/features/trips/presentation/trip-context";
import {
  AvatarGroup,
  AvatarGroupCount,
} from "@/shared/ui/avatar";
import { UserAvatar } from "@/shared/ui/user-avatar";

// ── Overview Tab ──────────────────────────────────────────────────────────

export function OverviewTab() {
  const { data } = useTripContext();

  if (!data) return null;

  const { trip, members } = data;

  const days = getInclusiveDateOnlySpan(trip.start_date, trip.end_date);

  const dateRange = `${formatDateOnly(trip.start_date, {
    month: "short",
    day: "numeric",
  })} – ${formatDateOnly(trip.end_date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  const totalBudget = trip.budget_estimate
    ? formatTripMoneyAmount(trip.budget_estimate, trip.currency_code)
    : null;

  const budgetPerPerson =
    trip.budget_estimate && members.length > 0
      ? formatTripMoneyAmount(parseFloat(trip.budget_estimate) / members.length, trip.currency_code)
      : null;

  const MAX_AVATARS = 5;
  const visibleMembers = members.slice(0, MAX_AVATARS);
  const extraCount = members.length - MAX_AVATARS;

  return (
    <div className="divide-y divide-border/50">

      {/* ── Key info ──────────────────────────────────────────────────────── */}
      <div
        className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both pb-6"
        style={{ animationDuration: "0.5s", animationDelay: "0ms" }}
      >
        <div className="space-y-4">

          {/* Dates */}
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{dateRange}</p>
              <p className="text-xs text-muted-foreground">{days} days</p>
            </div>
          </div>

          {/* Members */}
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {members.length} member{members.length !== 1 ? "s" : ""}
              </p>
              <AvatarGroup>
                {visibleMembers.map((m) => (
                  <UserAvatar key={m.membership_id} user={m.user} size="sm" />
                ))}
                {extraCount > 0 && (
                  <AvatarGroupCount className="text-[10px]">
                    +{extraCount}
                  </AvatarGroupCount>
                )}
              </AvatarGroup>
            </div>
          </div>

          {/* Budget */}
          {totalBudget && (
            <div className="flex items-start gap-3">
              <Wallet className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {totalBudget} {trip.currency_code}
                </p>
                {budgetPerPerson && (
                  <p className="text-xs text-muted-foreground">
                    ~{budgetPerPerson} {trip.currency_code} per person
                  </p>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Description ───────────────────────────────────────────────────── */}
      {trip.description && (
        <div
          className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both py-6"
          style={{ animationDuration: "0.5s", animationDelay: "140ms" }}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            About
          </p>
          <p className="text-sm leading-relaxed text-foreground/75">{trip.description}</p>
        </div>
      )}

    </div>
  );
}
