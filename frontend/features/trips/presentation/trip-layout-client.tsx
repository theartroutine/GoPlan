"use client";

import { Spinner } from "@/shared/ui/spinner";
import { TripProvider, useTripContext } from "@/features/trips/presentation/trip-context";
import { TripHeader } from "@/features/trips/presentation/trip-header";
import { TripTabBar } from "@/features/trips/presentation/trip-tab-bar";

function TripShell({ children }: { children: React.ReactNode }) {
  const { data, loading, error, notFound } = useTripContext();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">
          Trip not found or you are not a member.
        </p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-destructive">{error ?? "Something went wrong."}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <TripHeader trip={data.trip} />
      <TripTabBar />
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

export function TripLayoutClient({
  tripId,
  children,
}: {
  tripId: string;
  children: React.ReactNode;
}) {
  return (
    <TripProvider tripId={tripId}>
      <TripShell>{children}</TripShell>
    </TripProvider>
  );
}
