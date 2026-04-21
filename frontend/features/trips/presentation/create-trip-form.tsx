"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import type { CreateTripPayload } from "@/features/trips/domain/types";
import { bffCreateTrip } from "@/features/trips/infrastructure/trips-api";
import { CoverImagePicker } from "@/features/trips/presentation/cover-image-picker";
import type { DestinationPickerValue } from "@/features/trips/presentation/destination-picker";
import { DestinationPicker } from "@/features/trips/presentation/destination-picker";
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

  // -------- Destination State --------
  const [pickerValue, setPickerValue] = useState<DestinationPickerValue | null>(null);
  const [rawDestination, setRawDestination] = useState("");

  // -------- Cover Image State --------
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string>("");
  const [permanentCoverUrl, setPermanentCoverUrl] = useState<string | null>(null);

  /**
   * Called when the user commits a selection from the dropdown.
   * Called with null when the user edits the input after a committed selection.
   */
  const handlePickerChange = useCallback((value: DestinationPickerValue | null) => {
    setPickerValue(value);
  }, []);

  /**
   * Called by CoverImagePicker when the user uploads a custom image.
   * CoverImagePicker already calls bffUploadTripCover internally,
   * so the URL received here is always a permanent /media/... URL.
   */
  function handleCoverChange(url: string) {
    setCoverPreviewUrl(url);
    setPermanentCoverUrl(url);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!startDate || !endDate) {
      setError("Please select both start and end dates.");
      return;
    }

    const destination = pickerValue?.destination ?? rawDestination;
    if (!destination.trim()) {
      setError("Please enter a destination.");
      return;
    }

    setLoading(true);

    const form = new FormData(e.currentTarget);
    const payload: CreateTripPayload = {
      name:        (form.get("name") as string | null) ?? "",
      destination,
      start_date:  startDate,
      end_date:    endDate,
      description: (form.get("description") as string | null) || undefined,
      ...(pickerValue && {
        destination_provider:     pickerValue.destination_provider,
        destination_provider_id:  pickerValue.destination_provider_id,
        destination_lat:          pickerValue.destination_lat,
        destination_lng:          pickerValue.destination_lng,
        destination_country_code: pickerValue.destination_country_code,
      }),
      cover_image_url: permanentCoverUrl ?? "",
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
  const isSubmitDisabled = loading;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Trip name *</Label>
        <Input id="name" name="name" placeholder="Đà Lạt 2026" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="destination">Destination *</Label>
        <DestinationPicker
          id="destination"
          onChange={handlePickerChange}
          onRawInputChange={setRawDestination}
        />
      </div>
      <CoverImagePicker coverUrl={coverPreviewUrl} onChange={handleCoverChange} />
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
      <Button type="submit" className="w-full" disabled={isSubmitDisabled}>
        {loading ? "Creating…" : "Create trip"}
      </Button>
    </form>
  );
}
