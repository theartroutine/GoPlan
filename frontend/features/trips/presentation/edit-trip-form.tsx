"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import {
  apiBudgetToInputValue,
  budgetInputToPayload,
  normalizeBudgetInputForCurrencyChange,
} from "@/features/trips/domain/money";
import {
  isTripDescriptionTooLong,
  TRIP_DESCRIPTION_MAX_LENGTH,
} from "@/features/trips/domain/trip-description";
import type { TripDetail, UpdateTripPayload } from "@/features/trips/domain/types";
import {
  bffUpdateTrip,
  extractBffErrorDetail,
} from "@/features/trips/infrastructure/trips-api";
import { BudgetEstimateInput } from "@/features/trips/presentation/budget-estimate-input";
import { CoverImagePicker } from "@/features/trips/presentation/cover-image-picker";
import { CurrencySelect } from "@/features/trips/presentation/currency-select";
import type { DestinationPickerValue } from "@/features/trips/presentation/destination-picker";
import { DestinationPicker } from "@/features/trips/presentation/destination-picker";
import { TripDescriptionField } from "@/features/trips/presentation/trip-description-field";
import { TimezonePicker } from "@/features/trips/presentation/timezone-picker";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

export function EditTripForm({
  trip,
  onSaved,
}: {
  trip: TripDetail;
  onSaved?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const initialBudgetEstimate = apiBudgetToInputValue(trip.budget_estimate, trip.currency_code);
  const [startDate, setStartDate] = useState<string>(trip.start_date);
  const [endDate, setEndDate] = useState<string>(trip.end_date);
  const [timezone, setTimezone] = useState<string>(trip.timezone);
  const [currencyCode, setCurrencyCode] = useState<string>(trip.currency_code);
  const [budgetEstimate, setBudgetEstimate] = useState<string>(() => initialBudgetEstimate);
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

  function handleCurrencyChange(nextCurrencyCode: string) {
    setCurrencyCode(nextCurrencyCode);
    setBudgetEstimate((currentBudgetEstimate) =>
      normalizeBudgetInputForCurrencyChange(currentBudgetEstimate, nextCurrencyCode),
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const destination = pickerValue?.destination ?? rawDestination;
    const description = (form.get("description") as string | null) ?? "";
    const submittedBudgetEstimate = budgetInputToPayload(budgetEstimate, currencyCode);

    if (!destination.trim()) {
      setError("Please enter a destination.");
      return;
    }

    if (isTripDescriptionTooLong(description)) {
      setError(`Description must be ${TRIP_DESCRIPTION_MAX_LENGTH} characters or fewer.`);
      return;
    }

    setLoading(true);

    // Build base payload from non-destination fields.
    const payload: UpdateTripPayload = {
      name:        (form.get("name") as string) || undefined,
      start_date:  startDate || undefined,
      end_date:    endDate || undefined,
      description,
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

    if (currencyCode !== trip.currency_code) {
      payload.currency_code = currencyCode;
    }

    if (budgetEstimate !== initialBudgetEstimate) {
      payload.budget_estimate = submittedBudgetEstimate || null;
    }

    try {
      await bffUpdateTrip(trip.id, payload);
      await onSaved?.();
      router.push(`/trips/${trip.id}/overview`);
    } catch (err) {
      setError(
        extractBffErrorDetail(
          err,
          "Failed to update trip. Please check your inputs and try again.",
        ),
      );
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
        <TimezonePicker
          id="timezone"
          value={timezone}
          onChange={setTimezone}
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-1.5">
          <Label htmlFor="currency_code">Currency</Label>
          <CurrencySelect
            id="currency_code"
            value={currencyCode}
            onChange={handleCurrencyChange}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budget_estimate">Budget estimate</Label>
          <BudgetEstimateInput
            id="budget_estimate"
            value={budgetEstimate}
            currencyCode={currencyCode}
            onChange={setBudgetEstimate}
          />
        </div>
      </div>
      <TripDescriptionField defaultValue={trip.description} />
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
