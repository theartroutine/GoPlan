"use client";

import { useEffect, useState } from "react";

import type { TripInvitation, TripMemberItem } from "@/features/trips/domain/types";
import {
  bffGetInvitations,
  bffRemoveMember,
} from "@/features/trips/infrastructure/trips-api";
import { InviteMembersModal } from "@/features/trips/presentation/invite-members-modal";
import { useTripContext } from "@/features/trips/presentation/trip-context";
import { Button } from "@/shared/ui/button";

function MemberRow({
  member,
  onRemove,
  removeDisabled,
}: {
  member: TripMemberItem;
  onRemove?: () => void;
  removeDisabled?: boolean;
}) {
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
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
            disabled={removeDisabled}
            onClick={onRemove}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export function MembersTab() {
  const { tripId, data, refresh } = useTripContext();
  const [pendingInvitations, setPendingInvitations] = useState<TripInvitation[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isCaptain = data?.my_membership.role === "CAPTAIN";
  const isTerminal =
    data?.trip.status === "COMPLETED" || data?.trip.status === "CANCELLED";

  useEffect(() => {
    if (isCaptain && data) {
      bffGetInvitations(tripId).then((d) => setPendingInvitations(d.invitations));
    }
  }, [isCaptain, tripId, data]);

  if (!data) return null;

  const { trip, members } = data;

  async function handleRemove(userId: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      await bffRemoveMember(trip.id, userId);
      await refresh();
    } catch {
      setActionError("Could not remove member.");
    } finally {
      setActionLoading(false);
    }
  }

  function refreshInvitations() {
    bffGetInvitations(tripId).then((d) => setPendingInvitations(d.invitations));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Members ({members.length})
          </h2>
          {isCaptain && !isTerminal && (
            <Button size="sm" onClick={() => setShowInvite(true)}>
              + Invite
            </Button>
          )}
        </div>

        {actionError && (
          <p className="mb-2 text-sm text-destructive">{actionError}</p>
        )}

        <div className="divide-y divide-border">
          {members.map((m) => (
            <MemberRow
              key={m.membership_id}
              member={m}
              onRemove={
                isCaptain && m.role !== "CAPTAIN" && !isTerminal
                  ? () => void handleRemove(m.user.id)
                  : undefined
              }
              removeDisabled={actionLoading}
            />
          ))}
        </div>
      </div>

      {isCaptain && pendingInvitations.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pending Invitations ({pendingInvitations.length})
          </h2>
          <ul className="space-y-2">
            {pendingInvitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
              >
                <span>{inv.invitee.display_name}</span>
                <span className="text-xs text-muted-foreground">Pending</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showInvite && (
        <InviteMembersModal
          tripId={trip.id}
          onClose={() => setShowInvite(false)}
          onInvited={refreshInvitations}
        />
      )}
    </div>
  );
}
