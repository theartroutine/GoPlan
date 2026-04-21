"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

import { Spinner } from "@/shared/ui/spinner";
import { TripProvider, useTripContext } from "@/features/trips/presentation/trip-context";
import { TripHeader } from "@/features/trips/presentation/trip-header";
import { TripTabBar } from "@/features/trips/presentation/trip-tab-bar";

function TripShell({ children }: { children: React.ReactNode }) {
  const { data, loading, error, notFound } = useTripContext();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

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

  const portalTarget = mounted ? document.getElementById("trip-nav-portal") : null;

  return (
    <>
      {portalTarget && createPortal(<TripTabBar />, portalTarget)}
      <div>
        <TripHeader trip={data.trip} />
        <div className="border-t border-border/40 px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
            {children}
          </div>
      </div>
    </>
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
