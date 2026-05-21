"use client";

import {
  BadgeCheck,
  CheckCircle2,
  CircleHelp,
  CircleX,
  TimerOff,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type { AIActionDraft } from "@/features/chat/domain/ai-action-drafts";

type StatusConfig = {
  label: string;
  Icon: LucideIcon;
  className: string;
};

const STATUS_CONFIG: Record<AIActionDraft["status"], StatusConfig> = {
  NEEDS_INFO: {
    label: "Cần thêm thông tin",
    Icon: CircleHelp,
    className: "bg-amber-50 text-amber-700 ring-amber-100",
  },
  READY: {
    label: "Sẵn sàng",
    Icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
  CONFIRMED: {
    label: "Đã xác nhận",
    Icon: BadgeCheck,
    className: "bg-blue-50 text-blue-700 ring-blue-100",
  },
  EXECUTED: {
    label: "Hoàn tất",
    Icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
  CANCELLED: {
    label: "Đã hủy",
    Icon: CircleX,
    className: "bg-rose-50 text-rose-700 ring-rose-100",
  },
  EXPIRED: {
    label: "Đã hết hạn",
    Icon: TimerOff,
    className: "bg-orange-50 text-orange-700 ring-orange-100",
  },
  FAILED: {
    label: "Thất bại",
    Icon: TriangleAlert,
    className: "bg-red-50 text-red-700 ring-red-100",
  },
};

export function StatusPill({ status }: { status: AIActionDraft["status"] }) {
  const { label, Icon, className } = STATUS_CONFIG[status];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ${className}`}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
