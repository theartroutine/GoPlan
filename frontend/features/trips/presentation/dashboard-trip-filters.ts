import type { TripStatus } from "@/features/trips/domain/types";

export const DASHBOARD_FILTER_TABS = [
  { key: "ALL", label: "All", status: null },
  { key: "PLANNING", label: "Planning", status: "PLANNING" },
  { key: "ONGOING", label: "Ongoing", status: "ONGOING" },
  { key: "COMPLETED", label: "Completed", status: "COMPLETED" },
  { key: "CANCELLED", label: "Cancelled", status: "CANCELLED" },
] as const;

export type DashboardFilterKey = (typeof DASHBOARD_FILTER_TABS)[number]["key"];

export function isTripStatus(value: string | null): value is TripStatus {
  return value === "PLANNING" || value === "ONGOING" || value === "COMPLETED" || value === "CANCELLED";
}

export function getDashboardFilterStatus(
  value: string | null,
): TripStatus | null {
  return isTripStatus(value) ? value : null;
}
