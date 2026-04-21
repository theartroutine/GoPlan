import Image from "next/image";

import { getTripCoverUrl } from "@/features/trips/domain/get-trip-cover-url";
import type { TripDetail } from "@/features/trips/domain/types";
import { TripStatusBadge } from "@/features/trips/presentation/trip-status-badge";

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TripHeader({ trip }: { trip: TripDetail }) {
  return (
    <div className="relative h-44 overflow-hidden">
      <Image
        src={getTripCoverUrl(trip.cover_image_url)}
        alt={`${trip.name} cover`}
        fill
        className="object-cover"
        unoptimized
      />
      <div className="absolute inset-0 bg-black/25" />
      <div className="absolute right-4 top-4">
        <TripStatusBadge status={trip.status} />
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-5 pb-4 pt-10">
        <h1 className="text-xl font-bold leading-tight text-white sm:text-2xl">
          {trip.name}
        </h1>
        <p className="mt-0.5 text-sm text-white/80">
          📍 {trip.destination} · {fmtDate(trip.start_date)} → {fmtDate(trip.end_date)}
        </p>
      </div>
    </div>
  );
}
