import Link from "next/link";
import Image from "next/image";
import { CalendarDays, MapPin, Users } from "lucide-react";

import { getTripCoverUrl } from "@/features/trips/domain/get-trip-cover-url";
import type { TripListItem } from "@/features/trips/domain/types";
import { TripStatusBadge } from "@/features/trips/presentation/trip-status-badge";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function TripCard({ trip }: { trip: TripListItem }) {
  const dateRange = `${dateFormatter.format(new Date(trip.start_date))} – ${dateFormatter.format(new Date(trip.end_date))}`;
  const budgetPerPerson =
    trip.budget_estimate && trip.member_count > 0
      ? (parseFloat(trip.budget_estimate) / trip.member_count).toLocaleString("vi-VN")
      : null;

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="group block overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative h-32 w-full">
        <Image
          src={getTripCoverUrl(trip.cover_image_url)}
          alt={`${trip.name} cover`}
          fill
          className="object-cover"
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-lg font-semibold leading-tight text-foreground transition-colors group-hover:text-foreground/90">
            {trip.name}
          </h3>
          <TripStatusBadge status={trip.status} className="shrink-0" />
        </div>

        <p className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{trip.destination}</span>
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            {dateRange}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5" />
            {trip.member_count} member{trip.member_count !== 1 ? "s" : ""}
          </span>
          {budgetPerPerson && (
            <span className="font-medium text-foreground/80">
              ~{budgetPerPerson} {trip.currency_code}/person
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
