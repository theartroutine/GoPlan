import { cn } from "@/shared/lib/utils";
import type { TripStatus } from "@/features/trips/domain/types";

const STATUS_CONFIG: Record<TripStatus, { label: string; tone: string; dotTone: string }> = {
  PLANNING: {
    label: "Planning",
    tone: "border-sky-200/90 bg-sky-50 text-sky-700",
    dotTone: "bg-sky-500",
  },
  ONGOING: {
    label: "Ongoing",
    tone: "border-emerald-200/90 bg-emerald-50 text-emerald-700",
    dotTone: "bg-emerald-500",
  },
  COMPLETED: {
    label: "Completed",
    tone: "border-slate-200/90 bg-slate-100 text-slate-700",
    dotTone: "bg-slate-500",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "border-rose-200/90 bg-rose-50 text-rose-700",
    dotTone: "bg-rose-500",
  },
};

type TripStatusBadgeVariant = "default" | "hero";

export function TripStatusBadge({
  status,
  variant = "default",
  className,
  style,
}: {
  status: TripStatus;
  variant?: TripStatusBadgeVariant;
  className?: string;
  style?: React.CSSProperties;
}) {
  const config = STATUS_CONFIG[status];
  const isHero = variant === "hero";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
        isHero
          ? "border-white/30 bg-black/35 text-white backdrop-blur-sm"
          : config.tone,
        className,
      )}
      style={style}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isHero ? "bg-white/90" : config.dotTone,
        )}
      />
      {config.label}
    </span>
  );
}
