import Link from "next/link";
import { Users } from "lucide-react";

import type { TripMemberItem } from "@/features/trips/domain/types";
import { UserAvatar } from "@/shared/ui/user-avatar";

type Props = {
  tripId: string;
  members: TripMemberItem[];
};

const MAX_TILES = 11;

export function OverviewMembersCard({ tripId, members }: Props) {
  const count = members.length;
  const visible = members.slice(0, count > 12 ? MAX_TILES : count);
  const extra = count > 12 ? count - MAX_TILES : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Users aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <p className="text-base font-semibold leading-tight">
          {count} {count === 1 ? "member" : "members"}
        </p>
      </div>

      {count === 1 ? (
        <div className="flex items-center gap-3">
          <div data-member-tile>
            <UserAvatar user={members[0].user} size="lg" />
          </div>
          <Link
            href={`/trips/${tripId}/members`}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Invite members
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {visible.map((m) => (
            <div
              key={m.membership_id}
              data-member-tile
              className="flex aspect-square items-center justify-center"
            >
              <UserAvatar user={m.user} size="lg" />
            </div>
          ))}
          {extra > 0 && (
            <Link
              href={`/trips/${tripId}/members`}
              className="flex aspect-square items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              +{extra} more
              <span className="sr-only"> members, view all</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
