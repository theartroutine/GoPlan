"use client";

import { useState } from "react";
import { toast } from "sonner";

import type {
  AIActionDraftMissingField,
} from "@/features/chat/domain/ai-action-drafts";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  TimeRangePicker,
  type TimeRangeValue,
} from "@/shared/ui/time-range-picker";

type Props = {
  fields: AIActionDraftMissingField[];
  pending: boolean;
  tripTimezone?: string;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldErrorsFromError(error: unknown): Record<string, string> | null {
  const response = isRecord(error) ? error.response : null;
  const data = isRecord(response) ? response.data : null;
  const fe = isRecord(data) ? data.field_errors : null;
  if (!isRecord(fe)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fe)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export function FieldEditor({ fields, pending, tripTimezone, onSave }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>(
    {},
  );

  const hasInlineError = Object.values(fieldErrors).some((e) => Boolean(e));
  const editableFields = fields.filter((f) => f.type !== "target");

  function setField(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function setError(name: string, error: string | null) {
    setFieldErrors((prev) => ({ ...prev, [name]: error }));
  }

  async function handleSubmit() {
    if (hasInlineError) return;

    // Strip empty string values; they signal "not filled".
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === "string" && v.trim() === "") continue;
      if (v === null || v === undefined) continue;
      payload[k] = v;
    }
    if (Object.keys(payload).length === 0) {
      toast.error("Fill in at least one field before saving.");
      return;
    }
    try {
      await onSave(payload);
      setFieldErrors({});
      toast.success("Draft updated");
    } catch (err: unknown) {
      const fe = fieldErrorsFromError(err);
      if (fe) {
        for (const [k, v] of Object.entries(fe)) setError(k, v);
      } else {
        toast.error("Could not save. Try again.");
      }
    }
  }

  function renderField(field: AIActionDraftMissingField) {
    if (field.type === "target") {
      return (
        <div key={field.name} className="block space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">{field.label}</span>
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground">
            Ask GoPlanAI to clarify the target.
          </p>
        </div>
      );
    }

    if (field.type === "time_range") {
      const c = field.constraints ?? {};
      const sectionIndex = typeof c.section_index === "number" ? c.section_index : 1;
      const sectionDate = typeof c.section_date === "string" ? c.section_date : "";
      const tz = tripTimezone ?? "UTC";
      const v: TimeRangeValue = {
        start: typeof values.start_time === "string" ? values.start_time : null,
        end: typeof values.end_time === "string" ? values.end_time : null,
      };
      return (
        <div key={field.name} className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">
            {field.label}
          </span>
          <TimeRangePicker
            sectionIndex={sectionIndex}
            sectionDate={sectionDate}
            tripTimezone={tz}
            value={v}
            presets={field.presets ?? []}
            disabled={pending}
            onChange={(next) => {
              setField("start_time", next.start);
              setField("end_time", next.end);
            }}
            onError={(err) => setError("end_time", err)}
          />
          {fieldErrors.start_time ? (
            <span className="text-xs text-destructive">{fieldErrors.start_time}</span>
          ) : null}
        </div>
      );
    }

    if (field.type === "select" && field.options?.length) {
      return (
        <label key={field.name} className="block space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">{field.label}</span>
          <select
            aria-label={field.label}
            disabled={pending}
            value={String(values[field.name] ?? "")}
            onChange={(e) => setField(field.name, e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Select…</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {fieldErrors[field.name] ? (
            <span className="text-xs text-destructive">{fieldErrors[field.name]}</span>
          ) : null}
        </label>
      );
    }

    const type =
      field.type === "time"
        ? "time"
        : field.type === "money"
        ? "text"
        : "text";
    return (
      <label key={field.name} className="block space-y-1 text-xs">
        <span className="font-medium text-muted-foreground">{field.label}</span>
        <Input
          aria-label={field.label}
          type={type}
          inputMode={field.type === "money" ? "decimal" : undefined}
          disabled={pending}
          value={String(values[field.name] ?? "")}
          onChange={(e) => setField(field.name, e.target.value)}
          className={fieldErrors[field.name] ? "border-destructive" : undefined}
        />
        {fieldErrors[field.name] ? (
          <span className="text-xs text-destructive">{fieldErrors[field.name]}</span>
        ) : null}
      </label>
    );
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {fields.map((field) => renderField(field))}
      {editableFields.length > 0 ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={pending || hasInlineError}
          >
            {pending ? "Saving…" : "Save info"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
