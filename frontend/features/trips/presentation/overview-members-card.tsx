import Link from "next/link";
import { UserPlus } from "lucide-react";

import type { TripMemberItem } from "@/features/trips/domain/types";
import { cn } from "@/shared/lib/utils";
import { UserAvatar } from "@/shared/ui/user-avatar";

type Props = {
  tripId: string;
  members: TripMemberItem[];
};

const MAX_VISIBLE_ROWS = 5;

function roleLabel(role: TripMemberItem["role"]): string {
  return role === "CAPTAIN" ? "Captain" : "Member";
}

function roleTone(role: TripMemberItem["role"]): string {
  return role === "CAPTAIN"
    ? "border-amber-200/80 bg-amber-50 text-amber-700"
    : "border-border bg-muted text-muted-foreground";
}

export function OverviewMembersCard({ tripId, members }: Props) {
  const count = members.length;
  const visible = count > MAX_VISIBLE_ROWS ? members.slice(0, MAX_VISIBLE_ROWS) : members;
  const extra = count > MAX_VISIBLE_ROWS ? count - MAX_VISIBLE_ROWS : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold leading-tight">
          {count} {count === 1 ? "member" : "members"}
        </p>
        <Link
          href={`/trips/${tripId}/members`}
          className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground/80 transition-colors hover:border-foreground/30 hover:bg-muted hover:text-foreground"
        >
          <UserPlus aria-hidden="true" className="size-3" />
          Invite
        </Link>
      </div>

      <ul className="space-y-2">
        {visible.map((m) => (
          <li
            key={m.membership_id}
            data-member-row
            className="flex items-center gap-3"
          >
            <UserAvatar user={m.user} size="default" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">
                {m.user.display_name}
              </p>
              {m.user.identify_tag && (
                <p className="truncate text-[11px] text-muted-foreground">
                  @{m.user.identify_tag}
                </p>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                roleTone(m.role),
              )}
            >
              {roleLabel(m.role)}
            </span>
          </li>
        ))}
        {extra > 0 && (
          <li>
            <Link
              href={`/trips/${tripId}/members`}
              className="flex items-center justify-center rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted hover:text-foreground"
            >
              +{extra} more
              <span className="sr-only"> members, view all</span>
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
