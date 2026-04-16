"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { TripDetailResponse, TripInvitation, TripMemberItem } from "@/features/trips/domain/types";
import { bffCancelTrip, bffCompleteTrip, bffGetInvitations, bffGetTrip, bffLeaveTrip, bffRemoveMember, bffStartTrip } from "@/features/trips/infrastructure/trips-api";
import { InviteMembersModal } from "@/features/trips/presentation/invite-members-modal";
import { TripStatusBadge } from "@/features/trips/presentation/trip-status-badge";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

function MemberRow({ member, onRemove, removeDisabled }: { member: TripMemberItem; onRemove?: () => void; removeDisabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-medium">{member.user.display_name}</p>
        {member.user.identify_tag && (
          <p className="text-xs text-muted-foreground">{member.user.identify_tag}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium capitalize">
          {member.role === "CAPTAIN" ? "Captain" : "Member"}
        </span>
        {onRemove && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive" disabled={removeDisabled} onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export function TripOverviewContent({ tripId }: { tripId: string }) {
  const [data, setData] = useState<TripDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<TripInvitation[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();

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

  useEffect(() => {
    if (data?.my_membership.role === "CAPTAIN") {
      bffGetInvitations(tripId).then((d) => setPendingInvitations(d.invitations));
    }
  }, [data, tripId]);

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
  const isTerminal = trip.status === "COMPLETED" || trip.status === "CANCELLED";

  async function handleStartTrip() {
    setActionLoading(true);
    setActionError(null);
    try {
      await bffStartTrip(trip.id);
      router.refresh();
    } catch {
      setActionError("Could not start trip. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }
  async function handleCompleteTrip() {
    setActionLoading(true);
    setActionError(null);
    try {
      await bffCompleteTrip(trip.id);
      router.refresh();
    } catch {
      setActionError("Could not complete trip. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }
  async function handleCancelTrip() {
    setActionLoading(true);
    setActionError(null);
    try {
      await bffCancelTrip(trip.id);
      router.refresh();
    } catch {
      setActionError("Could not cancel trip. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }
  async function handleRemoveMember(userId: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      await bffRemoveMember(trip.id, userId);
      router.refresh();
    } catch {
      setActionError("Could not remove member. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }
  async function handleLeaveTrip() {
    setActionLoading(true);
    setActionError(null);
    try {
      await bffLeaveTrip(trip.id);
      router.push("/");
      return; // navigation takes over; don't touch loading state
    } catch {
      setActionError("Could not leave trip. Please try again.");
      setActionLoading(false);
    }
  }

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
            <MemberRow
              key={m.membership_id}
              member={m}
              onRemove={
                isCaptain && m.role !== "CAPTAIN" && !isTerminal
                  ? () => handleRemoveMember(m.user.id)
                  : undefined
              }
              removeDisabled={actionLoading}
            />
          ))}
        </div>
      </div>

      {/* Captain status actions */}
      {isCaptain && !isTerminal && (
        <>
          {actionError && (
            <p className="mb-2 text-sm text-destructive">{actionError}</p>
          )}
          <div className="mb-4 flex flex-wrap gap-2">
            {trip.status === "PLANNING" && (
              <Button size="sm" disabled={actionLoading} onClick={handleStartTrip}>Start Trip</Button>
            )}
            {trip.status === "ONGOING" && (
              <Button size="sm" disabled={actionLoading} onClick={handleCompleteTrip}>Complete Trip</Button>
            )}
            <Button size="sm" variant="destructive" disabled={actionLoading} onClick={handleCancelTrip}>Cancel Trip</Button>
          </div>
        </>
      )}

      {/* Captain actions */}
      {isCaptain && !isTerminal && (
        <div className="mb-6">
          <Button size="sm" onClick={() => setShowInvite(true)}>+ Invite members</Button>
          {showInvite && (
            <InviteMembersModal
              tripId={trip.id}
              onClose={() => setShowInvite(false)}
              onInvited={() => {
                bffGetInvitations(tripId).then((d) => setPendingInvitations(d.invitations));
              }}
            />
          )}
        </div>
      )}

      {/* Pending invitations (captain only) */}
      {isCaptain && pendingInvitations.length > 0 && (
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Pending invitations ({pendingInvitations.length})
          </h2>
          <ul className="space-y-2">
            {pendingInvitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <span>{inv.invitee.display_name}</span>
                <span className="text-xs text-muted-foreground">Pending</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Leave trip (non-captain members only) */}
      {!isCaptain && !isTerminal && (
        <div className="pt-2">
          {actionError && (
            <p className="mb-2 text-sm text-destructive">{actionError}</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive hover:bg-destructive/10"
            disabled={actionLoading}
            onClick={handleLeaveTrip}
          >
            Leave Trip
          </Button>
        </div>
      )}
    </div>
  );
}
