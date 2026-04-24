"use client";

import { useEffect, useState } from "react";

import type { InvitableFriend } from "@/features/trips/domain/types";
import { bffGetInvitableFriends, bffSendInvitations } from "@/features/trips/infrastructure/trips-api";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";

type Props = { tripId: string; onClose: () => void; onInvited: () => void };

export function InviteMembersModal({ tripId, onClose, onInvited }: Props) {
  const [friends, setFriends] = useState<InvitableFriend[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    bffGetInvitableFriends(tripId)
      .then((d) => setFriends(d.users))
      .catch(() => setFetchError("Failed to load friends. Please try again."));
  }, [tripId]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSend() {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      await bffSendInvitations(tripId, [...selected]);
      onInvited();
      onClose();
    } catch {
      setFetchError("Failed to send invitations. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-card p-5 sm:rounded-2xl">
        <h2 className="mb-4 font-semibold">Invite friends</h2>
        {friends.length === 0 ? (
          <p className="text-sm text-muted-foreground">No eligible friends to invite.</p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {friends.map((f) => (
              <li key={f.id}>
                <label
                  htmlFor={`invite-${f.id}`}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selected.has(f.id) ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <Checkbox
                    id={`invite-${f.id}`}
                    checked={selected.has(f.id)}
                    onCheckedChange={() => toggleSelect(f.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{f.display_name}</p>
                    <p className="text-xs text-muted-foreground">{f.identify_tag}</p>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        )}
        {fetchError && (
          <p className="mt-3 text-sm text-destructive">{fetchError}</p>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={selected.size === 0 || loading} onClick={handleSend}>
            {loading ? "Sending..." : `Invite${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
