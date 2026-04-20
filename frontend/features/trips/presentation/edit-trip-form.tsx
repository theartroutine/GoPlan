"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import type { TripDetail, UpdateTripPayload } from "@/features/trips/domain/types";
import { bffUpdateTrip, bffUploadTripCover } from "@/features/trips/infrastructure/trips-api";
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // -------- Destination State --------
  // pickerValue is null on mount — user has not changed the destination yet.
  // We only populate it when the user commits a new selection from the dropdown.
  const [pickerValue, setPickerValue] = useState<DestinationPickerValue | null>(null);
  const [rawDestination, setRawDestination] = useState(trip.destination);

  // -------- Cover Image State --------
  // coverPreviewUrl initializes to the trip's existing cover (already a permanent /media/... URL).
  // permanentCoverUrl is null on mount (null = "cover not changed").
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string>(trip.cover_image_url ?? "");
  const [permanentCoverUrl, setPermanentCoverUrl] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  /**
   * Called when the user commits a new place selection from the dropdown.
   * Shows the new BFF proxy photo immediately, then background-uploads so
   * the DB always receives a permanent /media/... URL.
   * Called with null when the user edits the input after a committed selection.
   */
  const handlePickerChange = useCallback(async (value: DestinationPickerValue | null) => {
    setPickerValue(value);
    setPermanentCoverUrl(null);

    if (!value) {
      // User modified input — revert cover preview to the trip's original
      setCoverPreviewUrl(trip.cover_image_url ?? "");
      return;
    }

    if (value.cover_image_url) {
      // Show preview immediately using the BFF proxy URL
      setCoverPreviewUrl(value.cover_image_url);

      // Background upload → permanent storage
      setCoverUploading(true);
      try {
        const res = await fetch(value.cover_image_url);
        const blob = await res.blob();
        const file = new File([blob], "cover.jpg", { type: blob.type || "image/jpeg" });
        const url = await bffUploadTripCover(file);
        setPermanentCoverUrl(url);
        setCoverPreviewUrl(url); // update preview to permanent URL
      } catch {
        // Upload failed silently — cover will not be updated for this destination.
      } finally {
        setCoverUploading(false);
      }
    }
  }, [trip.cover_image_url]);

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
    setLoading(true);

    const form = new FormData(e.currentTarget);

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
    //         structured fields so they don't contradict the new destination string.
    // Case 3: destination was not touched — omit all destination fields entirely.
    if (pickerValue) {
      payload.destination              = pickerValue.destination;
      payload.destination_place_id     = pickerValue.destination_place_id;
      payload.destination_lat          = pickerValue.destination_lat;
      payload.destination_lng          = pickerValue.destination_lng;
      payload.destination_country_code = pickerValue.destination_country_code;
      payload.cover_image_url          = permanentCoverUrl ?? undefined;
    } else if (rawDestination !== trip.destination) {
      payload.destination              = rawDestination;
      payload.destination_place_id     = "";
      payload.destination_lat          = null;
      payload.destination_lng          = null;
      payload.destination_country_code = "";
      payload.cover_image_url          = "";
    }

    // If user uploaded a custom cover without changing destination, send it independently.
    if (permanentCoverUrl && !pickerValue) {
      payload.cover_image_url = permanentCoverUrl;
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
  const isSubmitDisabled = loading || coverUploading;

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
        />
      </div>
      {coverPreviewUrl && (
        <CoverImagePicker coverUrl={coverPreviewUrl} onChange={handleCoverChange} />
      )}
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
          {coverUploading ? "Uploading cover…" : loading ? "Saving…" : "Save changes"}
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
