"use client";

import { ArrowRightLeft, Handshake, MapPin, Sparkles, Wallet } from "lucide-react";

import type { AIActionDisplay } from "@/features/chat/domain/ai-action-drafts";

const ICON_BY_KIND = {
  activity: { Icon: MapPin, tint: "bg-indigo-50 text-indigo-600" },
  expense: { Icon: Wallet, tint: "bg-emerald-50 text-emerald-600" },
  settlement: { Icon: Handshake, tint: "bg-purple-50 text-purple-600" },
  transfer: { Icon: ArrowRightLeft, tint: "bg-amber-50 text-amber-600" },
  info: { Icon: Sparkles, tint: "bg-slate-50 text-slate-600" },
} as const;

export function ActionIcon({ icon }: { icon: AIActionDisplay["icon"] }) {
  const entry = ICON_BY_KIND[icon] ?? ICON_BY_KIND.info;
  const { Icon, tint } = entry;
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${tint}`}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}
