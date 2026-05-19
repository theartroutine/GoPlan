import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Crown, UserPlus, Users } from "lucide-react";

import type { TripMemberItem } from "@/features/trips/domain/types";
import { UserAvatar } from "@/shared/ui/user-avatar";

type Props = {
  tripId: string;
  members: TripMemberItem[];
};

const MAX_FEATURED_MEMBERS = 3;
const MAX_VISIBLE_AVATARS = 5;

const membersCardBackgroundStyle = {
  backgroundColor: "rgb(248 250 252)",
  backgroundImage:
    "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(248,250,252,0.8)), url('/images/trip-overview/overview-members-card.webp')",
  backgroundPosition: "center",
  backgroundSize: "cover",
} satisfies CSSProperties;

function findCaptain(members: TripMemberItem[]): TripMemberItem | undefined {
  return members.find((m) => m.role === "CAPTAIN");
}

function CaptainHero({ member }: { member: TripMemberItem }) {
  return (
    <div
      data-member-row
      data-role="captain"
      className="flex items-center gap-3 rounded-lg border border-border/70 bg-white/75 px-3 py-2.5 shadow-sm backdrop-blur-sm"
    >
      <div className="relative shrink-0">
        <UserAvatar user={member.user} size="default" />
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm ring-2 ring-white"
        >
          <Crown className="size-3" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">
          {member.user.display_name}
        </p>
        {member.user.identify_tag && (
          <p className="truncate text-[11px] text-muted-foreground">
            @{member.user.identify_tag}
          </p>
        )}
      </div>
      <span
        className="shrink-0 rounded-full border border-amber-300/60 bg-white/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800"
      >
        Captain
      </span>
    </div>
  );
}

function FeaturedMemberRow({ member }: { member: TripMemberItem }) {
  return (
    <div
      data-member-row
      data-role="featured"
      className="flex items-center gap-3 rounded-lg border border-border/60 bg-white/70 px-3 py-2.5 shadow-xs backdrop-blur-sm"
    >
      <UserAvatar user={member.user} size="default" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight text-foreground">
          {member.user.display_name}
        </p>
        {member.user.identify_tag && (
          <p className="truncate text-[11px] text-muted-foreground">
            @{member.user.identify_tag}
          </p>
        )}
      </div>
    </div>
  );
}

function FeaturedMembers({ members }: { members: TripMemberItem[] }) {
  if (members.length === 0) return null;

  return (
    <div className="space-y-2">
      {members.map((member) => (
        <FeaturedMemberRow key={member.membership_id} member={member} />
      ))}
    </div>
  );
}

function AvatarCluster({
  tripId,
  members,
}: {
  tripId: string;
  members: TripMemberItem[];
}) {
  const total = members.length;
  const overflow = Math.max(0, total - MAX_VISIBLE_AVATARS);
  const visible = members.slice(0, MAX_VISIBLE_AVATARS);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visible.map((m) => (
        <div
          key={m.membership_id}
          data-member-row
          data-role="cluster"
          className="relative shrink-0 rounded-full ring-2 ring-white"
          title={m.user.display_name}
        >
          <UserAvatar user={m.user} size="sm" />
        </div>
      ))}
      {overflow > 0 ? (
        <Link
          href={`/trips/${tripId}/members`}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border/80 bg-white/85 px-2.5 text-[11px] font-semibold text-foreground/70 shadow-sm backdrop-blur-sm transition-colors hover:border-foreground/30 hover:bg-white hover:text-foreground"
        >
          +{overflow} more
          <ArrowRight aria-hidden="true" className="size-3" />
        </Link>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {total} {total === 1 ? "traveler" : "travelers"} in the crew
        </p>
      )}
    </div>
  );
}

export function OverviewMembersCard({ tripId, members }: Props) {
  const count = members.length;
  const captain = findCaptain(members);
  const others = captain
    ? members.filter((m) => m.membership_id !== captain.membership_id)
    : members;

  // Keep a few names readable before the compact crew cluster.
  const featuredMembers = others.slice(0, MAX_FEATURED_MEMBERS);
  const crewMembers = others.slice(MAX_FEATURED_MEMBERS);
  const showCluster = crewMembers.length > 0;

  return (
    <div className="relative h-full overflow-hidden rounded-[inherit] bg-card">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={membersCardBackgroundStyle}
      />

      <div className="relative flex h-full flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-full bg-slate-800 text-white shadow-sm ring-2 ring-white/70"
            >
              <Users className="size-4" />
            </div>
            <p className="text-sm font-semibold leading-tight">
              {count} {count === 1 ? "member" : "members"}
            </p>
          </div>
          <Link
            href={`/trips/${tripId}/members`}
            className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-foreground/75 shadow-sm backdrop-blur-sm transition-colors hover:border-foreground/30 hover:bg-white hover:text-foreground"
          >
            <UserPlus aria-hidden="true" className="size-3" />
            Invite
          </Link>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {captain && <CaptainHero member={captain} />}

          <FeaturedMembers members={featuredMembers} />

          {showCluster ? (
            <div className="mt-auto space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Crew
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" />
              </div>
              <AvatarCluster tripId={tripId} members={crewMembers} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
