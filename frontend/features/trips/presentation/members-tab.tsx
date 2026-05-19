"use client";

import { useEffect, useState } from "react";
import { Crown, UserMinus, UserPlus } from "lucide-react";

import type { TripInvitation, TripMemberItem } from "@/features/trips/domain/types";
import {
  bffGetInvitations,
  bffRemoveMember,
} from "@/features/trips/infrastructure/trips-api";
import { InviteMembersModal } from "@/features/trips/presentation/invite-members-modal";
import { useTripContext } from "@/features/trips/presentation/trip-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { UserAvatar } from "@/shared/ui/user-avatar";

function CaptainSpotlight({ member }: { member: TripMemberItem }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-3 sm:px-4">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <UserAvatar
            user={member.user}
            size="default"
            className="ring-2 ring-white shadow-sm"
          />
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm ring-2 ring-white"
          >
            <Crown className="size-3" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">
            {member.user.display_name}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700/90">
            Captain
          </p>
        </div>
      </div>
    </div>
  );
}

function MemberTile({
  member,
  onRequestRemove,
}: {
  member: TripMemberItem;
  onRequestRemove?: () => void;
}) {
  return (
    <div
      className="group relative flex min-h-16 items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-3 transition-colors hover:border-border hover:bg-muted/35"
      title={
        member.user.identify_tag
          ? `${member.user.display_name} · @${member.user.identify_tag}`
          : member.user.display_name
      }
    >
      <UserAvatar
        user={member.user}
        size="default"
        className="shrink-0 ring-2 ring-white"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">
          {member.user.display_name}
        </p>
        {member.user.identify_tag && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            @{member.user.identify_tag}
          </p>
        )}
      </div>
      {onRequestRemove && (
        <button
          type="button"
          onClick={onRequestRemove}
          aria-label={`Remove ${member.user.display_name}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        >
          <UserMinus className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function PendingInvitationRow({ inv }: { inv: TripInvitation }) {
  const invitee = { ...inv.invitee, avatar_url: null };
  return (
    <li className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 bg-white/50 px-3 py-2.5">
      <div className="rounded-full border-2 border-dashed border-border/70 p-0.5">
        <UserAvatar user={invitee} size="sm" className="opacity-80" />
      </div>
      <p className="min-w-0 flex-1 truncate text-sm">
        {inv.invitee.display_name}
      </p>
      <span className="shrink-0 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Pending
      </span>
    </li>
  );
}

export function MembersTab() {
  const { tripId, data, refresh } = useTripContext();
  const [pendingInvitations, setPendingInvitations] = useState<TripInvitation[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TripMemberItem | null>(null);

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
  const captain = members.find((m) => m.role === "CAPTAIN");
  const others = captain
    ? members.filter((m) => m.membership_id !== captain.membership_id)
    : members;

  async function handleConfirmRemove() {
    if (!memberToRemove) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await bffRemoveMember(trip.id, memberToRemove.user.id);
      await refresh();
      setMemberToRemove(null);
    } catch {
      setActionError(
        `Could not remove ${memberToRemove.user.display_name}. Please try again.`,
      );
      setMemberToRemove(null);
    } finally {
      setActionLoading(false);
    }
  }

  function refreshInvitations() {
    bffGetInvitations(tripId).then((d) => setPendingInvitations(d.invitations));
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? "member" : "members"} in this trip
          </p>
        </div>
        {isCaptain && !isTerminal && (
          <Button
            size="sm"
            onClick={() => setShowInvite(true)}
            className="gap-1.5 shadow-sm"
          >
            <UserPlus className="size-3.5" />
            Invite
          </Button>
        )}
      </header>

      {actionError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <div className="space-y-5">
        {captain && <CaptainSpotlight member={captain} />}

        {others.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {others.map((m) => (
              <MemberTile
                key={m.membership_id}
                member={m}
                onRequestRemove={
                  isCaptain && !isTerminal
                    ? () => setMemberToRemove(m)
                    : undefined
                }
              />
            ))}
          </div>
        )}

        {isCaptain && pendingInvitations.length > 0 && (
          <section>
            <div className="mb-2.5 flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Pending
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" />
              <span className="text-[10px] font-semibold text-muted-foreground">
                {pendingInvitations.length}
              </span>
            </div>
            <ul className="space-y-2">
              {pendingInvitations.map((inv) => (
                <PendingInvitationRow key={inv.id} inv={inv} />
              ))}
            </ul>
          </section>
        )}
      </div>

      {showInvite && (
        <InviteMembersModal
          tripId={trip.id}
          onClose={() => setShowInvite(false)}
          onInvited={refreshInvitations}
        />
      )}

      <AlertDialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open && !actionLoading) setMemberToRemove(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <UserMinus />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Remove {memberToRemove?.user.display_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will lose access to this trip immediately. You can invite
              them back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={actionLoading}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmRemove();
              }}
            >
              {actionLoading ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
