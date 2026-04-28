"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { TimelineSection } from "@/features/trips/domain/types";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type Props = {
  /** When initial is set, this acts as a patch form. SYSTEM_DAY only allows label edits. */
  initial?: TimelineSection;
  submitting?: boolean;
  errorMessage?: string | null;
  unavailableSectionDates?: string[];
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSubmit: (payload: { label: string; section_date?: string }) => void;
};

export function TimelineSectionForm(props: Props) {
  const formKey = props.initial?.id ?? "create";

  return <TimelineSectionFormFields key={formKey} {...props} />;
}

function TimelineSectionFormFields({
  initial,
  submitting,
  errorMessage,
  unavailableSectionDates = [],
  onCancel,
  onDirtyChange,
  onSubmit,
}: Props) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [sectionDate, setSectionDate] = useState(initial?.section_date ?? "");
  const dirtyRef = useRef(false);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const isSystem = initial?.kind === "SYSTEM_DAY";
  const unavailableDates = useMemo(
    () => unavailableSectionDates.filter((date) => date !== initial?.section_date),
    [initial?.section_date, unavailableSectionDates],
  );
  const unavailableDateSet = useMemo(() => new Set(unavailableDates), [unavailableDates]);
  const isSelectedDateUnavailable = Boolean(sectionDate && unavailableDateSet.has(sectionDate));
  const dateError = isSelectedDateUnavailable ? "This date already has a timeline day." : null;

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  useEffect(() => {
    dirtyRef.current = false;
    onDirtyChangeRef.current?.(false);
  }, []);

  function markDirty() {
    if (dirtyRef.current) return;
    dirtyRef.current = true;
    onDirtyChangeRef.current?.(true);
  }

  function handleLabelChange(value: string) {
    markDirty();
    setLabel(value);
  }

  function handleDateChange(value: string) {
    markDirty();
    setSectionDate(value);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!label.trim()) return;
    if (isSelectedDateUnavailable) return;
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
          onChange={(e) => handleLabelChange(e.target.value)}
          disabled={!!submitting}
          required
        />
      </div>
      {!isSystem && (
        <div className="space-y-1.5">
          <Label htmlFor="section-date">Date *</Label>
          <DatePicker
            id="section-date"
            value={sectionDate}
            onChange={(date) => handleDateChange(date ?? "")}
            placeholder="Pick a date"
            disabled={submitting}
            disabledDates={unavailableDates}
          />
        </div>
      )}
      {(dateError || errorMessage) && (
        <p className="text-sm text-destructive">{dateError ?? errorMessage}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!!submitting || isSelectedDateUnavailable}>
          {submitting ? "Saving…" : initial ? "Save section" : "Add section"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={!!submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
