"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { bffLeaveTrip } from "@/features/trips/infrastructure/trips-api";
import { useTripContext } from "@/features/trips/presentation/trip-context";

const TABS = [
  { label: "Overview", path: "overview" },
  { label: "Member", path: "members" },
  { label: "Timeline", path: "timeline" },
  { label: "Expenses", path: "expenses" },
  { label: "Photos", path: "photos" },
  { label: "Chat", path: "chat" },
] as const;

export function TripTabBar() {
  const { tripId, data } = useTripContext();
  const pathname = usePathname();
  const router = useRouter();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  if (!data) return null;

  const { trip, my_membership } = data;
  const isCaptain = my_membership.role === "CAPTAIN";
  const isTerminal = trip.status === "COMPLETED" || trip.status === "CANCELLED";
  const canLeave = !isCaptain && !isTerminal;

  async function handleLeave() {
    setLeaving(true);
    setLeaveError(null);
    try {
      await bffLeaveTrip(tripId);
      router.push("/");
    } catch {
      setLeaveError("Could not leave trip.");
      setLeaving(false);
      setConfirmLeave(false);
    }
  }

  return (
    <div className="flex h-full w-full items-center overflow-x-auto">
      <div className="flex h-full flex-1">
        {TABS.map((tab) => {
          const href = `/trips/${tripId}/${tab.path}`;
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={tab.path}
              href={href}
              className={`flex h-full items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {canLeave && (
        <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          {leaveError && (
            <span className="text-xs text-destructive">{leaveError}</span>
          )}
          {confirmLeave ? (
            <>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                Are you sure?
              </span>
              <button
                type="button"
                disabled={leaving}
                onClick={() => void handleLeave()}
                className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
              >
                {leaving ? "Leaving…" : "Yes"}
              </button>
              <button
                type="button"
                disabled={leaving}
                onClick={() => setConfirmLeave(false)}
                className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
              >
                No
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="flex h-full items-center border-b-2 border-transparent px-3 text-sm font-medium text-destructive/70 transition-colors hover:text-destructive"
            >
              Leave Trip
            </button>
          )}
        </div>
      )}
    </div>
  );
}
