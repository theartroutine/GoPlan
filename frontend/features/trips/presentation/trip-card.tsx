import Link from "next/link";

import type { TripListItem } from "@/features/trips/domain/types";
import { TripStatusBadge } from "@/features/trips/presentation/trip-status-badge";

export function TripCard({ trip }: { trip: TripListItem }) {
  const dateRange = `${trip.start_date} → ${trip.end_date}`;
  const budgetPerPerson =
    trip.budget_estimate && trip.member_count > 0
      ? (parseFloat(trip.budget_estimate) / trip.member_count).toLocaleString("vi-VN")
      : null;

  return (
    <Link href={`/trips/${trip.id}`} className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{trip.name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">📍 {trip.destination}</p>
        </div>
        <TripStatusBadge status={trip.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>📅 {dateRange}</span>
        <span>👥 {trip.member_count} member{trip.member_count !== 1 ? "s" : ""}</span>
        {budgetPerPerson && (
          <span>~{budgetPerPerson} {trip.currency_code}/người</span>
        )}
      </div>
    </Link>
  );
}
