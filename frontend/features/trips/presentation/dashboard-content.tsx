"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useDashboardTrips } from "@/features/trips/application/use-dashboard-trips";
import { getDashboardFilterStatus } from "@/features/trips/presentation/dashboard-trip-filters";
import { TripCard } from "@/features/trips/presentation/trip-card";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

export function DashboardContent() {
  const searchParams = useSearchParams();
  const { trips, loading, error, retry } = useDashboardTrips();

  const activeStatus = getDashboardFilterStatus(searchParams.get("status"));
  const visibleTrips = activeStatus
    ? trips.filter((trip) => trip.status === activeStatus)
    : trips;

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
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && trips.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">No trips yet.</p>
          <Button asChild className="mt-4">
            <Link href="/trips/create">Create your first trip</Link>
          </Button>
        </div>
      )}

      {!loading && !error && trips.length > 0 && visibleTrips.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">No trips match this status.</p>
        </div>
      )}

      {!loading && !error && visibleTrips.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 md:gap-5 xl:grid-cols-3">
          {visibleTrips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}
