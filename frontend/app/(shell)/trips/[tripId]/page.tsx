"use client";

import { use } from "react";

import { TripOverviewContent } from "@/features/trips/presentation/trip-overview-content";

export default function TripOverviewPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  return <TripOverviewContent tripId={tripId} />;
}
