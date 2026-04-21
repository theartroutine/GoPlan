"use client";

import { CalendarDays, Users, Wallet } from "lucide-react";

import { useTripContext } from "@/features/trips/presentation/trip-context";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/shared/ui/avatar";

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(d: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(d).toLocaleDateString("en-US", opts ?? {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Overview Tab ──────────────────────────────────────────────────────────

export function OverviewTab() {
  const { data } = useTripContext();

  if (!data) return null;

  const { trip, members } = data;

  const days =
    Math.ceil(
      (new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1;

  const dateRange = `${fmtDate(trip.start_date, { month: "short", day: "numeric" })} – ${fmtDate(trip.end_date)}`;

  const totalBudget = trip.budget_estimate
    ? parseFloat(trip.budget_estimate).toLocaleString("vi-VN")
    : null;

  const budgetPerPerson =
    trip.budget_estimate && members.length > 0
      ? (parseFloat(trip.budget_estimate) / members.length).toLocaleString("vi-VN")
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
                  <Avatar key={m.membership_id} size="sm">
                    <AvatarFallback className="text-[10px]">
                      {m.user.display_name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
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
