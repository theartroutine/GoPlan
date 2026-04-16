"use client";

import { useEffect, useState } from "react";

import type { TripDetailResponse, TripMemberItem } from "@/features/trips/domain/types";
import { bffGetTrip } from "@/features/trips/infrastructure/trips-api";
import { TripStatusBadge } from "@/features/trips/presentation/trip-status-badge";
import { Spinner } from "@/shared/ui/spinner";

function MemberRow({ member }: { member: TripMemberItem }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-medium">{member.user.display_name}</p>
        {member.user.identify_tag && (
          <p className="text-xs text-muted-foreground">{member.user.identify_tag}</p>
        )}
      </div>
      <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium capitalize">
        {member.role === "CAPTAIN" ? "Captain" : "Member"}
      </span>
    </div>
  );
}

export function TripOverviewContent({ tripId }: { tripId: string }) {
  const [data, setData] = useState<TripDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    bffGetTrip(tripId)
      .then(setData)
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 403 || status === 404) {
          setNotFound(true);
        } else {
          setError("Failed to load trip.");
        }
      })
      .finally(() => setLoading(false));
  }, [tripId]);

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
        <p className="text-muted-foreground">Trip not found or you are not a member.</p>
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

  const { trip, my_membership, members } = data;

  const budgetPerPerson =
    trip.budget_estimate && members.length > 0
      ? (parseFloat(trip.budget_estimate) / members.length).toLocaleString("vi-VN")
      : null;

  const isCaptain = my_membership.role === "CAPTAIN";

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="flex-1 text-2xl font-bold">{trip.name}</h1>
          <TripStatusBadge status={trip.status} />
        </div>
        <p className="mt-1 text-muted-foreground">{trip.destination}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {trip.start_date} &rarr; {trip.end_date}
        </p>
      </div>

      {/* Description */}
      {trip.description && (
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Description
          </h2>
          <p className="text-sm leading-relaxed">{trip.description}</p>
        </div>
      )}

      {/* Budget */}
      {trip.budget_estimate && (
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Budget
          </h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-medium">
                {parseFloat(trip.budget_estimate).toLocaleString("vi-VN")} {trip.currency_code}
              </span>
            </div>
            {budgetPerPerson && (
              <div>
                <span className="text-muted-foreground">Per person: </span>
                <span className="font-medium">~{budgetPerPerson} {trip.currency_code}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Members */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Members ({members.length})
        </h2>
        <div className="divide-y divide-border">
          {members.map((m) => (
            <MemberRow key={m.membership_id} member={m} />
          ))}
        </div>
      </div>

      {/* Captain-only placeholder */}
      {isCaptain && (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Captain actions coming in Issues 5&ndash;7
        </div>
      )}
    </div>
  );
}
