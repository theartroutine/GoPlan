"use client";

import { getInitials, deriveGradient } from "@/shared/lib/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";

export type UserAvatarUser = {
  avatar_url: string | null;
  display_name: string;
  identify_tag: string | null;
};

type Props = {
  user: UserAvatarUser;
  size?: "sm" | "default" | "lg" | "xl";
  className?: string;
};

export function UserAvatar({ user, size, className }: Props) {
  const initials = getInitials(user.display_name);
  const gradient = deriveGradient(user.identify_tag ?? user.display_name);
  return (
    <Avatar size={size} className={className}>
      {user.avatar_url ? (
        <AvatarImage src={user.avatar_url} alt={user.display_name} />
      ) : null}
      <AvatarFallback className={`font-medium ${gradient}`}>{initials}</AvatarFallback>
    </Avatar>
  );
}
