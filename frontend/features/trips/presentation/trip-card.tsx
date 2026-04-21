import Link from "next/link";
import Image from "next/image";

import { getTripCoverUrl } from "@/features/trips/domain/get-trip-cover-url";
import type { TripListItem } from "@/features/trips/domain/types";
import { TripStatusBadge } from "@/features/trips/presentation/trip-status-badge";

export function TripCard({ trip }: { trip: TripListItem }) {
  const dateRange = `${trip.start_date} → ${trip.end_date}`;
  const budgetPerPerson =
    trip.budget_estimate && trip.member_count > 0
      ? (parseFloat(trip.budget_estimate) / trip.member_count).toLocaleString("vi-VN")
      : null;

  return (
    <Link href={`/trips/${trip.id}`} className="block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-muted/50">
      <div className="relative h-28 w-full">
        <Image
          src={getTripCoverUrl(trip.cover_image_url)}
          alt={`${trip.name} cover`}
          fill
          className="object-cover"
          unoptimized
        />
      </div>
      <div className="p-4">
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
      </div>
    </Link>
  );
}
