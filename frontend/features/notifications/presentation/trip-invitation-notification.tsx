"use client";

import { useState } from "react";

import type { Notification, TripInvitationPayload } from "@/features/notifications/domain/types";
import { Button } from "@/shared/ui/button";

type Props = {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onAccept: (invitationId: string, notificationId: string) => Promise<void>;
  onDecline: (invitationId: string, notificationId: string) => Promise<void>;
};

// onMarkRead is kept in Props for shared use by plain-text notifications in NotificationItem.
// TripInvitationNotification does not call it — the dropdown's accept/decline handlers already
// call markRead, so invoking it here would result in a duplicate HTTP request.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TripInvitationNotification({ notification, onMarkRead: _onMarkRead, onAccept, onDecline }: Props) {
  const [loading, setLoading] = useState<"accept" | "decline" | null>(null);
  const [responded, setResponded] = useState<"accepted" | "declined" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const payload = notification.payload as unknown as TripInvitationPayload;
  const actorName = notification.actor?.display_name ?? "Someone";

  async function handleAccept() {
    setLoading("accept");
    setActionError(null);
    try {
      await onAccept(payload.invitation_id, notification.id);
      setResponded("accepted");
    } catch {
      setActionError("Failed to accept invitation. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function handleDecline() {
    setLoading("decline");
    setActionError(null);
    try {
      await onDecline(payload.invitation_id, notification.id);
      setResponded("declined");
    } catch {
      setActionError("Failed to decline invitation. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className={`px-4 py-3 ${notification.is_read ? "opacity-70" : "border-l-2 border-primary"}`}>
      <div className="flex items-start gap-3">
        {!notification.is_read && (
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
        )}
        <div className={`min-w-0 flex-1 ${notification.is_read ? "pl-5" : ""}`}>
          <p className="text-sm leading-snug">
            <span className="font-medium">{actorName}</span> invited you to join a trip
          </p>
          <p className="mt-0.5 text-sm font-semibold text-primary">{payload.trip_name}</p>
          <p className="text-xs text-muted-foreground">
            📍 {payload.destination} · {payload.start_date} → {payload.end_date}
          </p>

          {responded ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {responded === "accepted" ? "✓ You joined the trip" : "Invitation declined"}
            </p>
          ) : (
            <>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  className="h-7 flex-1 text-xs"
                  disabled={loading !== null}
                  onClick={handleAccept}
                >
                  {loading === "accept" ? "..." : "Accept"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-xs"
                  disabled={loading !== null}
                  onClick={handleDecline}
                >
                  {loading === "decline" ? "..." : "Decline"}
                </Button>
              </div>
              {actionError && (
                <p className="mt-1 text-xs text-destructive">{actionError}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
