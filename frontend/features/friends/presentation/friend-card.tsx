"use client";

import type { ReactNode } from "react";

import type { FriendUser } from "@/features/friends/domain/types";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";

type FriendCardProps = {
  user: FriendUser;
  actions?: ReactNode;
};

export function FriendCard({ user, actions }: FriendCardProps) {
  const initials = user.display_name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Avatar>
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.display_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {user.identify_tag}
        </p>
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
