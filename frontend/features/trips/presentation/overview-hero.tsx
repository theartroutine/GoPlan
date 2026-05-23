"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";

import { TripCoverImage } from "@/features/trips/presentation/trip-cover-image";
import { TripStatusBadge } from "@/features/trips/presentation/trip-status-badge";
import type { TripStatus } from "@/features/trips/domain/types";
import { useMainScroll } from "@/shared/hooks/use-main-scroll";

type Props = {
  tripName: string;
  destination: string;
  coverImageUrl: string | null | undefined;
  status: TripStatus;
};

export function OverviewHero({
  tripName,
  destination,
  coverImageUrl,
  status,
}: Props) {
  const heroRef = useRef<HTMLElement | null>(null);
  const [heroHeight, setHeroHeight] = useState(0);
  const scrollY = useMainScroll(heroRef);

  useLayoutEffect(() => {
    if (heroRef.current) setHeroHeight(heroRef.current.offsetHeight);
  }, []);

  const maxOffset = heroHeight * 0.3;
  const parallaxY = Math.min(scrollY * 0.3, maxOffset);

  return (
    <section
      ref={heroRef}
      className="relative h-[60vh] w-full overflow-hidden sm:h-[68vh] lg:h-[72vh]"
    >
      <div
        className="absolute inset-x-0 top-[-30%] h-[160%]"
        style={{ transform: `translate3d(0, ${parallaxY}px, 0)` }}
      >
        <div className="relative h-full w-full animate-ken-burns">
          <TripCoverImage
            coverUrl={coverImageUrl}
            alt={`${tripName} cover`}
            fill
            loading="eager"
            fetchPriority="high"
            className="object-cover"
            unoptimized
          />
        </div>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 70% 30%, rgba(255,220,180,0.18), transparent 50%)",
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.45) 75%, rgba(0,0,0,0.65) 100%)",
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 animate-particle-drift"
        style={{
          backgroundImage: [
            "radial-gradient(2px 2px at 20% 30%, rgba(255,255,255,0.6) 50%, transparent 51%)",
            "radial-gradient(1.5px 1.5px at 80% 20%, rgba(255,255,255,0.5) 50%, transparent 51%)",
            "radial-gradient(2px 2px at 60% 70%, rgba(255,255,255,0.4) 50%, transparent 51%)",
            "radial-gradient(1px 1px at 40% 80%, rgba(255,255,255,0.5) 50%, transparent 51%)",
            "radial-gradient(1.5px 1.5px at 90% 50%, rgba(255,255,255,0.4) 50%, transparent 51%)",
            "radial-gradient(1px 1px at 15% 60%, rgba(255,255,255,0.4) 50%, transparent 51%)",
            "radial-gradient(1.5px 1.5px at 50% 15%, rgba(255,255,255,0.4) 50%, transparent 51%)",
          ].join(", "),
        }}
      />

      <div className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6">
        <TripStatusBadge status={status} variant="hero" />
      </div>

      <div className="absolute inset-x-0 bottom-12 z-10 px-5 sm:bottom-14 sm:px-7">
        <h1
          className="line-clamp-2 text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl"
          style={{ textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
        >
          {tripName}
        </h1>
        <p
          className="mt-1.5 flex items-center gap-1.5 text-sm text-white/85"
          style={{ textShadow: "0 1px 6px rgba(0,0,0,0.4)" }}
        >
          <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{destination}</span>
        </p>
      </div>

      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-3 z-10 flex justify-center"
      >
        <ChevronDown className="size-5 text-white/70 animate-scroll-cue" />
      </div>
    </section>
  );
}
