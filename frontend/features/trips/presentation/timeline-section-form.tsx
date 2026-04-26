"use client";

import { useState } from "react";

import type { TimelineSection } from "@/features/trips/domain/types";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type Props = {
  /** When initial is set, this acts as a patch form. SYSTEM_DAY only allows label edits. */
  initial?: TimelineSection;
  submitting?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onSubmit: (payload: { label: string; section_date?: string }) => void;
};

export function TimelineSectionForm({ initial, submitting, errorMessage, onCancel, onSubmit }: Props) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [sectionDate, setSectionDate] = useState(initial?.section_date ?? "");
  const isSystem = initial?.kind === "SYSTEM_DAY";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!label.trim()) return;
    if (initial) {
      const payload: { label: string; section_date?: string } = { label };
      if (!isSystem && sectionDate && sectionDate !== initial.section_date) {
        payload.section_date = sectionDate;
      }
      onSubmit(payload);
    } else {
      if (!sectionDate) return;
      onSubmit({ label, section_date: sectionDate });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="space-y-1.5">
        <Label htmlFor="section-label">Label *</Label>
        <Input
          id="section-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
      </div>
      {!isSystem && (
        <div className="space-y-1.5">
          <Label htmlFor="section-date">Date *</Label>
          <Input
            id="section-date"
            type="date"
            value={sectionDate}
            onChange={(e) => setSectionDate(e.target.value)}
            required
          />
        </div>
      )}
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={!!submitting}>
          {submitting ? "Saving…" : initial ? "Save section" : "Add section"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
