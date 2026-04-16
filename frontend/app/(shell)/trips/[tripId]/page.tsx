import { TripOverviewContent } from "@/features/trips/presentation/trip-overview-content";

export default async function TripOverviewPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <TripOverviewContent tripId={tripId} />;
}
