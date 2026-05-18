"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { Spinner } from "@/shared/ui/spinner";
import { TripProvider, useTripContext } from "@/features/trips/presentation/trip-context";
import { TripTabBar } from "@/features/trips/presentation/trip-tab-bar";
import { OverviewHero } from "@/features/trips/presentation/overview-hero";
import { OverviewActionStrip } from "@/features/trips/presentation/overview-action-strip";

function TripShell({ children }: { children: React.ReactNode }) {
  const { tripId, data, loading, error, notFound, refresh } = useTripContext();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

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

  const isOverview = pathname.endsWith("/overview");
  const isChat = pathname.endsWith("/chat");
  const portalTarget = mounted ? document.getElementById("trip-nav-portal") : null;

  const TAB_TITLES: Record<string, string> = {
    members: "Members",
    timeline: "Timeline",
    expenses: "Expenses",
  };
  const tabTitle = TAB_TITLES[pathname.split("/").pop() ?? ""];

  if (isChat) {
    return (
      <>
        {portalTarget && createPortal(<TripTabBar />, portalTarget)}
        <div className="flex h-full min-h-0 flex-col">{children}</div>
      </>
    );
  }

  if (isOverview) {
    const { trip, my_membership, members } = data;
    const isCaptain = my_membership.role === "CAPTAIN";
    const isTerminal = trip.status === "COMPLETED" || trip.status === "CANCELLED";
    return (
      <>
        {portalTarget && createPortal(<TripTabBar />, portalTarget)}
        <div>
          <OverviewHero
            tripName={trip.name}
            destination={trip.destination}
            coverImageUrl={trip.cover_image_url}
            status={trip.status}
          />
          <OverviewActionStrip
            tripId={tripId}
            isCaptain={isCaptain}
            isTerminal={isTerminal}
            memberCount={members.length}
            onCancelled={refresh}
          />
          <div className="px-4 pb-6 pt-2 sm:px-6 sm:pb-8">
            {children}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {portalTarget && createPortal(<TripTabBar />, portalTarget)}
      <div>
        {tabTitle && (
          <div className="px-4 pt-5 pb-1 sm:px-6">
            <h1 className="text-xl font-semibold tracking-tight">{tabTitle}</h1>
          </div>
        )}
        <div className="px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
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
