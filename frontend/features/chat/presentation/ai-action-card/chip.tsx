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

const ICON_TONE: Record<ChipIcon, string> = {
  clock: "bg-sky-50 text-sky-700",
  calendar: "bg-violet-50 text-violet-700",
  "map-pin": "bg-indigo-50 text-indigo-700",
  users: "bg-emerald-50 text-emerald-700",
  user: "bg-amber-50 text-amber-700",
};

export function Chip({ icon, label }: { icon?: ChipIcon; label: string }) {
  if (!icon) {
    return (
      <span className="inline-flex min-h-7 items-center gap-1.5 text-xs font-medium text-foreground">
        {label}
      </span>
    );
  }

  const Icon = ICONS[icon];
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 text-xs font-medium text-foreground">
      <span
        className={`inline-flex size-5 items-center justify-center rounded-md ${ICON_TONE[icon]}`}
      >
        <Icon className="size-3" aria-hidden />
      </span>
      {label}
    </span>
  );
}
