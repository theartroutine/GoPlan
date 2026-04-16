"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CreateTripPayload } from "@/features/trips/domain/types";
import { bffCreateTrip } from "@/features/trips/infrastructure/trips-api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

export function CreateTripForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const payload: CreateTripPayload = {
      name:        form.get("name") as string,
      destination: form.get("destination") as string,
      start_date:  form.get("start_date") as string,
      end_date:    form.get("end_date") as string,
      description: form.get("description") as string || undefined,
    };

    try {
      const res = await bffCreateTrip(payload);
      router.push(`/trips/${res.trip.id}`);
    } catch {
      setError("Failed to create trip. Please check your inputs and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Trip name *</Label>
        <Input id="name" name="name" placeholder="Đà Lạt 2026" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="destination">Destination *</Label>
        <Input id="destination" name="destination" placeholder="Đà Lạt" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="start_date">Start date *</Label>
          <Input id="start_date" name="start_date" type="date" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end_date">End date *</Label>
          <Input id="end_date" name="end_date" type="date" required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" placeholder="What's this trip about?" rows={3} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating..." : "Create trip"}
      </Button>
    </form>
  );
}
