"use client";

import { getInitials } from "@/shared/lib/format";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";

type ProfilePreviewCardProps = {
  firstName: string;
  lastName: string;
  identifyName: string;
};

export function ProfilePreviewCard({ firstName, lastName, identifyName }: ProfilePreviewCardProps) {
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  const displayName = [trimmedFirst, trimmedLast].filter(Boolean).join(" ");
  const identifyTag = identifyName ? `${identifyName}#??????` : "";
  const initials = displayName ? getInitials(displayName) : "?";

  return (
    <div className="rounded-xl bg-card p-5 shadow-sm">
      <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Profile preview
      </p>
      <p className="mb-4 text-xs text-muted-foreground">
        This is how others will see you
      </p>

      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-muted text-sm font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-tight text-foreground">
            {displayName || <span className="text-muted-foreground">Your Name</span>}
          </p>
          {identifyTag ? (
            <p className="truncate text-xs text-muted-foreground">{identifyTag}</p>
          ) : (
            <p className="text-xs text-muted-foreground">yourname#??????</p>
          )}
        </div>
      </div>
    </div>
  );
}
