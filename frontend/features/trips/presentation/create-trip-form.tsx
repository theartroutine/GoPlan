"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CreateTripPayload } from "@/features/trips/domain/types";
import { bffCreateTrip } from "@/features/trips/infrastructure/trips-api";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

export function CreateTripForm() {
  const router = useRouter();
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!startDate || !endDate) {
      setError("Please select both start and end dates.");
      return;
    }

    setLoading(true);

    const form = new FormData(e.currentTarget);
    const payload: CreateTripPayload = {
      name:        (form.get("name") as string | null) ?? "",
      destination: (form.get("destination") as string | null) ?? "",
      start_date:  startDate,
      end_date:    endDate,
      description: (form.get("description") as string | null) || undefined,
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

  const endMinDate = startDate ? new Date(startDate + "T00:00:00") : undefined;

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
          <DatePicker
            id="start_date"
            value={startDate}
            onChange={setStartDate}
            placeholder="Pick start date"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end_date">End date *</Label>
          <DatePicker
            id="end_date"
            value={endDate}
            onChange={setEndDate}
            placeholder="Pick end date"
            minDate={endMinDate}
          />
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
