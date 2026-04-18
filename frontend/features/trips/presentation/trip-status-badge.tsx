import type { TripStatus } from "@/features/trips/domain/types";

const STATUS_CONFIG: Record<TripStatus, { label: string; className: string }> = {
  PLANNING:  { label: "Planning",  className: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
  ONGOING:   { label: "Ongoing",   className: "bg-green-500/10 text-green-400 border border-green-500/20" },
  COMPLETED: { label: "Completed", className: "bg-slate-500/10 text-slate-400 border border-slate-500/20" },
  CANCELLED: { label: "Cancelled", className: "bg-red-500/10 text-red-400 border border-red-500/20" },
};

export function TripStatusBadge({ status }: { status: TripStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
