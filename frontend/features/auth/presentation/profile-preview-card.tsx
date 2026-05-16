"use client";

import { UserAvatar } from "@/shared/ui/user-avatar";

type ProfilePreviewCardProps = {
  firstName: string;
  lastName: string;
  identifyName: string;
};

export function ProfilePreviewCard({ firstName, lastName, identifyName }: ProfilePreviewCardProps) {
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  const displayName = [trimmedFirst, trimmedLast].filter(Boolean).join(" ");
  const identifyTag = identifyName ? `${identifyName}#??????` : null;

  return (
    <div className="rounded-xl bg-card p-5 shadow-sm">
      <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Profile preview
      </p>
      <p className="mb-4 text-xs text-muted-foreground">
        This is how others will see you
      </p>

      <div className="flex items-center gap-3">
        <UserAvatar
          user={{
            avatar_url: null,
            display_name: displayName || "Your Name",
            identify_tag: identifyTag,
          }}
          size="lg"
          className="shrink-0"
        />
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
