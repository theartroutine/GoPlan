"use client";

import type { AIActionDraft } from "@/features/chat/domain/ai-action-drafts";

const STATUS_LABEL: Record<AIActionDraft["status"], string> = {
  NEEDS_INFO: "Needs info",
  READY: "Ready",
  CONFIRMED: "Confirmed",
  EXECUTED: "Done",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  FAILED: "Failed",
};

const STATUS_TONE: Record<AIActionDraft["status"], string> = {
  NEEDS_INFO: "bg-amber-100 text-amber-800",
  READY: "bg-emerald-100 text-emerald-800",
  CONFIRMED: "bg-slate-100 text-slate-700",
  EXECUTED: "bg-slate-100 text-slate-700",
  CANCELLED: "bg-slate-100 text-slate-500",
  EXPIRED: "bg-slate-100 text-slate-500",
  FAILED: "bg-red-100 text-red-800",
};

export function StatusPill({ status }: { status: AIActionDraft["status"] }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
