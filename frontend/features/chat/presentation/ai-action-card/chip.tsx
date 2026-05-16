"use client";

import { Calendar, Clock, MapPin, User, Users } from "lucide-react";

import type { ChipIcon } from "./display-types";

const ICONS = {
  clock: Clock,
  calendar: Calendar,
  "map-pin": MapPin,
  users: Users,
  user: User,
} as const;

export function Chip({ icon, label }: { icon?: ChipIcon; label: string }) {
  const Icon = icon ? ICONS[icon] : null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground">
      {Icon ? <Icon className="size-3 opacity-70" aria-hidden /> : null}
      {label}
    </span>
  );
}
