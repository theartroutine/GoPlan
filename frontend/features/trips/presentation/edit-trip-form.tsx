"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import type { TripDetail, UpdateTripPayload } from "@/features/trips/domain/types";
import { bffUpdateTrip } from "@/features/trips/infrastructure/trips-api";
import { CoverImagePicker } from "@/features/trips/presentation/cover-image-picker";
import type { DestinationPickerValue } from "@/features/trips/presentation/destination-picker";
import { DestinationPicker } from "@/features/trips/presentation/destination-picker";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

export function EditTripForm({ trip }: { trip: TripDetail }) {
  const router = useRouter();
  const [startDate, setStartDate] = useState<string>(trip.start_date);
  const [endDate, setEndDate] = useState<string>(trip.end_date);
  const [timezone, setTimezone] = useState<string>(trip.timezone);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // -------- Destination State --------
  // pickerValue is null on mount — user has not changed the destination yet.
  // We only populate it when the user commits a new selection from the dropdown.
  const [pickerValue, setPickerValue] = useState<DestinationPickerValue | null>(null);
  const [rawDestination, setRawDestination] = useState(trip.destination);

  // -------- Cover Image State --------
  // coverPreviewUrl initializes to the trip's existing cover URL or default placeholder.
  // permanentCoverUrl is null on mount (null = "cover not changed").
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string>(trip.cover_image_url ?? "");
  const [permanentCoverUrl, setPermanentCoverUrl] = useState<string | null>(null);

  /**
   * Called when the user commits a new place selection from the dropdown.
   * Called with null when the user edits the input after a committed selection.
   */
  const handlePickerChange = useCallback((value: DestinationPickerValue | null) => {
    setPickerValue(value);
  }, []);

  /**
   * Called by CoverImagePicker when the user uploads a custom image.
   * The URL received here is always a permanent /media/... URL.
   */
  function handleCoverChange(url: string) {
    setCoverPreviewUrl(url);
    setPermanentCoverUrl(url);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const destination = pickerValue?.destination ?? rawDestination;

    if (!destination.trim()) {
      setError("Please enter a destination.");
      return;
    }

    setLoading(true);

    // Build base payload from non-destination fields.
    const payload: UpdateTripPayload = {
      name:        (form.get("name") as string) || undefined,
      start_date:  startDate || undefined,
      end_date:    endDate || undefined,
      description: (form.get("description") as string) || undefined,
    };

    // Include destination fields only when the user changed the destination.
    // Case 1: user selected a place from the dropdown — send full structured data.
    // Case 2: user edited the text but did not pick — send raw text and clear stale
    //         structured destination fields so they don't contradict the new destination string.
    // Case 3: destination was not touched — omit all destination fields entirely.
    if (pickerValue) {
      payload.destination              = pickerValue.destination;
      payload.destination_provider     = pickerValue.destination_provider;
      payload.destination_provider_id  = pickerValue.destination_provider_id;
      payload.destination_lat          = pickerValue.destination_lat;
      payload.destination_lng          = pickerValue.destination_lng;
      payload.destination_country_code = pickerValue.destination_country_code;
    } else if (rawDestination !== trip.destination) {
      payload.destination              = destination;
      payload.destination_provider     = "";
      payload.destination_provider_id  = "";
      payload.destination_lat          = null;
      payload.destination_lng          = null;
      payload.destination_country_code = "";
    }

    // If user uploaded a custom cover, send it independently from destination updates.
    if (permanentCoverUrl) {
      payload.cover_image_url = permanentCoverUrl;
    }

    if (timezone && timezone !== trip.timezone) {
      payload.timezone = timezone;
    }

    try {
      await bffUpdateTrip(trip.id, payload);
      router.push(`/trips/${trip.id}/overview`);
    } catch {
      setError("Failed to update trip. Please check your inputs and try again.");
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
        <Input id="name" name="name" defaultValue={trip.name} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="destination">Destination *</Label>
        <DestinationPicker
          id="destination"
          initialValue={trip.destination}
          onChange={handlePickerChange}
          onRawInputChange={setRawDestination}
          required
        />
      </div>
      <CoverImagePicker coverUrl={coverPreviewUrl} onChange={handleCoverChange} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="start_date">Start date *</Label>
          <DatePicker
            id="start_date"
            value={startDate}
            onChange={(d) => setStartDate(d ?? "")}
            placeholder="Pick start date"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end_date">End date *</Label>
          <DatePicker
            id="end_date"
            value={endDate}
            onChange={(d) => setEndDate(d ?? "")}
            placeholder="Pick end date"
            minDate={endMinDate}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="timezone">Trip timezone *</Label>
        <Input
          id="timezone"
          name="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="Asia/Ho_Chi_Minh"
          required
        />
        <p className="text-xs text-muted-foreground">IANA timezone, e.g. Asia/Ho_Chi_Minh, Asia/Tokyo.</p>
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
        <Button type="submit" disabled={isSubmitDisabled}>
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
