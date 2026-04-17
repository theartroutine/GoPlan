"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { TripDetail, UpdateTripPayload } from "@/features/trips/domain/types";
import { bffUpdateTrip } from "@/features/trips/infrastructure/trips-api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

export function EditTripForm({ trip }: { trip: TripDetail }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const payload: UpdateTripPayload = {
      name: (form.get("name") as string) || undefined,
      destination: (form.get("destination") as string) || undefined,
      start_date: (form.get("start_date") as string) || undefined,
      end_date: (form.get("end_date") as string) || undefined,
      description: (form.get("description") as string) || undefined,
    };

    try {
      await bffUpdateTrip(trip.id, payload);
      router.push(`/trips/${trip.id}/overview`);
    } catch {
      setError("Failed to update trip. Please check your inputs and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Trip name *</Label>
        <Input id="name" name="name" defaultValue={trip.name} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="destination">Destination *</Label>
        <Input id="destination" name="destination" defaultValue={trip.destination} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="start_date">Start date *</Label>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={trip.start_date}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end_date">End date *</Label>
          <Input
            id="end_date"
            name="end_date"
            type="date"
            defaultValue={trip.end_date}
            required
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={trip.description ?? ""}
          rows={3}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/trips/${trip.id}/overview`)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
