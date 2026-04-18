import { TripLayoutClient } from "@/features/trips/presentation/trip-layout-client";

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  return <TripLayoutClient tripId={tripId}>{children}</TripLayoutClient>;
}
