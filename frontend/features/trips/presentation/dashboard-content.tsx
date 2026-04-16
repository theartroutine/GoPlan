"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { TripListItem } from "@/features/trips/domain/types";
import { bffListTrips } from "@/features/trips/infrastructure/trips-api";
import { TripCard } from "@/features/trips/presentation/trip-card";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

export function DashboardContent() {
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bffListTrips()
      .then((data) => setTrips(data.results))
      .catch(() => setError("Failed to load trips."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">My Trips</h1>
        <Button asChild size="sm">
          <Link href="/trips/create">+ New trip</Link>
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {error && (
        <p className="text-center text-sm text-destructive">{error}</p>
      )}

      {!loading && !error && trips.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">No trips yet.</p>
          <Button asChild className="mt-4">
            <Link href="/trips/create">Create your first trip</Link>
          </Button>
        </div>
      )}

      {!loading && !error && trips.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}
