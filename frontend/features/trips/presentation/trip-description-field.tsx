"use client";

import { useState } from "react";

import { TRIP_DESCRIPTION_MAX_LENGTH } from "@/features/trips/domain/trip-description";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

type Props = {
  defaultValue?: string | null;
  placeholder?: string;
};

export function TripDescriptionField({
  defaultValue,
  placeholder = "What's this trip about?",
}: Props) {
  const initialValue = defaultValue ?? "";
  const [characterCount, setCharacterCount] = useState(initialValue.length);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="description">Description</Label>
        <span className="text-xs text-muted-foreground">
          {characterCount}/{TRIP_DESCRIPTION_MAX_LENGTH} characters
        </span>
      </div>
      <Textarea
        id="description"
        name="description"
        defaultValue={initialValue}
        placeholder={placeholder}
        maxLength={TRIP_DESCRIPTION_MAX_LENGTH}
        rows={3}
        onChange={(event) => {
          setCharacterCount(event.currentTarget.value.length);
        }}
      />
    </div>
  );
}
