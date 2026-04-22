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
  const destinationLabel = trip.destination || "No destination yet";

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="group block overflow-hidden rounded-3xl border border-black/10 bg-card shadow-[0_10px_30px_-20px_rgba(0,0,0,0.55)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_64px_-34px_rgba(0,0,0,0.7)]"
    >
      <div className="relative aspect-[4/5] min-h-80 w-full">
        <Image
          src={getTripCoverUrl(trip.cover_image_url)}
          alt={`${trip.name} cover`}
          fill
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 via-38% to-black/12" />

        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="space-y-3 rounded-2xl border border-white/15 bg-black/28 p-4 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <h3 className="line-clamp-2 text-xl font-semibold leading-tight text-white">
                {trip.name}
              </h3>
              <TripStatusBadge status={trip.status} variant="hero" className="shrink-0" />
            </div>

            <p className="inline-flex min-w-0 items-center gap-1.5 text-sm text-white/85">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{destinationLabel}</span>
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/90">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" />
                {dateRange}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" />
                {trip.member_count} member{trip.member_count !== 1 ? "s" : ""}
              </span>
              {budgetPerPerson && (
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                  ~{budgetPerPerson} {trip.currency_code}/person
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
