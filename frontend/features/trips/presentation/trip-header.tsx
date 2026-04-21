import Image from "next/image";
import { MapPin } from "lucide-react";

import { getTripCoverUrl } from "@/features/trips/domain/get-trip-cover-url";
import type { TripDetail } from "@/features/trips/domain/types";
import { TripStatusBadge } from "@/features/trips/presentation/trip-status-badge";

export function TripHeader({ trip }: { trip: TripDetail }) {
  return (
    <div>
      {/* ── Cover image + crossing badge ──────────────────────────────── */}
      {/*
        The outer div has an explicit height and is `relative` WITHOUT
        `overflow-hidden` so the badge can translate past its bottom edge.
        The image itself lives in an inner absolute+overflow-hidden container.
      */}
      <div className="relative h-44 sm:h-52">
        {/* Image layer – clipped here, not on the parent */}
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src={getTripCoverUrl(trip.cover_image_url)}
            alt={`${trip.name} cover`}
            fill
            className="object-cover"
            unoptimized
          />
          {/* Very subtle gradient only at the bottom to ease the transition */}
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background/30 to-transparent" />
        </div>

        {/* Status badge – sits at bottom-right, translate-y-1/2 crosses the edge */}
        <div className="absolute bottom-0 right-5 z-10 translate-y-1/2">
          <TripStatusBadge
            status={trip.status}
            style={{ boxShadow: "0 0 0 6px var(--background)" }}
          />
        </div>
      </div>

      {/* ── Trip name + destination ───────────────────────────────────── */}
      {/* pt-5 gives breathing room above the badge that crosses into this area */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="truncate text-xl font-bold leading-tight sm:text-2xl">
          {trip.name}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{trip.destination}</span>
        </p>
      </div>
    </div>
  );
}
