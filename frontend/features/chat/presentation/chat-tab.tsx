"use client";

import { useAuth } from "@/features/auth/application/auth-context";
import { ChatRoom } from "@/features/chat/presentation/chat-room";
import { useTripContext } from "@/features/trips/presentation/trip-context";

export function ChatTab() {
  const { tripId, data } = useTripContext();
  const { user } = useAuth();

  if (!data || !user) return null;

  const isTerminal =
    data.trip.status === "COMPLETED" || data.trip.status === "CANCELLED";

  return (
    <ChatRoom
      tripId={tripId}
      isTerminal={isTerminal}
      currentUser={{
        id: user.id,
        display_name: user.display_name,
        identify_tag: user.identify_tag,
      }}
    />
  );
}
