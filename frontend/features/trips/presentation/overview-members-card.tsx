import Link from "next/link";
import { ArrowRight, Crown, Heart, Sparkles, Star, UserPlus, Users } from "lucide-react";

import type { TripMemberItem } from "@/features/trips/domain/types";
import { cn } from "@/shared/lib/utils";
import { UserAvatar } from "@/shared/ui/user-avatar";

type Props = {
  tripId: string;
  members: TripMemberItem[];
};

const MAX_VISIBLE_AVATARS = 5;

function CommunityPattern() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <Sparkles className="absolute right-3 top-2 size-7 text-violet-400/30" />
      <Heart className="absolute left-4 top-4 size-5 -rotate-12 text-rose-400/25" />
      <Star className="absolute right-10 top-1/3 size-4 rotate-12 text-amber-400/30" />
      <Users className="absolute -bottom-2 right-2 size-14 text-violet-300/20" />
      <Sparkles className="absolute bottom-4 left-3 size-5 text-rose-300/25" />
      <Star className="absolute bottom-6 right-1/3 size-3 text-violet-400/25" />
      {/* gentle connecting dots */}
      <svg
        className="absolute inset-x-0 top-1/2 h-12 w-full text-violet-300/20"
        viewBox="0 0 200 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeDasharray="1 4"
      >
        <path d="M10 20 Q 60 0 110 20 T 200 18" />
      </svg>
    </div>
  );
}

function findCaptain(members: TripMemberItem[]): TripMemberItem | undefined {
  return members.find((m) => m.role === "CAPTAIN");
}

function CaptainHero({ member }: { member: TripMemberItem }) {
  return (
    <div
      data-member-row
      data-role="captain"
      className="flex items-center gap-3 rounded-xl border border-amber-200/70 bg-white/70 px-3 py-2.5 shadow-sm backdrop-blur-sm"
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
        className={cn(
          "shrink-0 rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700",
        )}
      >
        Captain
      </span>
    </div>
  );
}

function MemberRichRow({ member }: { member: TripMemberItem }) {
  return (
    <div
      data-member-row
      data-role="member"
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-white/60 px-3 py-2 shadow-xs backdrop-blur-sm"
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
      <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Member
      </span>
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
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-violet-200/80 bg-white/85 px-2.5 text-[11px] font-semibold text-violet-700 shadow-sm backdrop-blur-sm transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900"
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

  // Display strategy:
  // - 1 member (captain only): hero row only
  // - 2 members: captain hero + 1 rich row
  // - 3+ members: captain hero + avatar cluster (bounded height)
  const showRichRow = others.length === 1;
  const showCluster = others.length >= 2;

  return (
    <div className="relative h-full overflow-hidden rounded-[inherit] bg-gradient-to-br from-violet-50 via-white to-rose-50/60">
      <CommunityPattern />

      <div className="relative flex h-full flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-full bg-violet-500 text-white shadow-sm ring-2 ring-violet-100"
            >
              <Users className="size-4" />
            </div>
            <p className="text-sm font-semibold leading-tight">
              {count} {count === 1 ? "member" : "members"}
            </p>
          </div>
          <Link
            href={`/trips/${tripId}/members`}
            className="inline-flex items-center gap-1 rounded-full border border-violet-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-violet-700 shadow-sm backdrop-blur-sm transition-colors hover:border-violet-300 hover:bg-violet-50"
          >
            <UserPlus aria-hidden="true" className="size-3" />
            Invite
          </Link>
        </div>

        {captain && <CaptainHero member={captain} />}

        {showRichRow && <MemberRichRow member={others[0]!} />}

        {showCluster && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Crew
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-violet-200/60 to-transparent" />
            </div>
            <AvatarCluster tripId={tripId} members={others} />
          </div>
        )}
      </div>
    </div>
  );
}
