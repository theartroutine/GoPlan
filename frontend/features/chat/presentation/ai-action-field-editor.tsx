"use client";

import { useState } from "react";

import type { AIActionDraftMissingField } from "@/features/chat/domain/ai-action-drafts";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";

type Props = {
  fields: AIActionDraftMissingField[];
  pending: boolean;
  onSave: (payload: Record<string, unknown>) => void;
};

const TARGET_FIELD_MESSAGE = "Ask GoPlanAI to clarify the target.";

function parseFieldValue(field: AIActionDraftMissingField, rawValue: string): unknown {
  if (field.type !== "json") return rawValue;
  if (!rawValue.trim()) return {};
  return JSON.parse(rawValue);
}

export function AIActionFieldEditor({ fields, pending, onSave }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const editableFields = fields.filter((field) => field.type !== "target");

  function handleSubmit() {
    const payload: Record<string, unknown> = {};
    try {
      for (const field of editableFields) {
        if (!(field.name in values)) continue;
        payload[field.name] = parseFieldValue(field, values[field.name] ?? "");
      }
    } catch {
      setError("JSON value is invalid.");
      return;
    }
    setError(null);
    onSave(payload);
  }

  function handleValueChange(fieldName: string, value: string): void {
    setValues((current) => ({
      ...current,
      [fieldName]: value,
    }));
  }

  function renderControl(field: AIActionDraftMissingField) {
    const value = values[field.name] ?? "";
    if (field.options?.length) {
      return (
        <select
          aria-label={field.label}
          className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          value={value}
          disabled={pending}
          onChange={(event) => handleValueChange(field.name, event.target.value)}
        >
          <option value="">Select...</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    if (field.type === "json") {
      return (
        <Textarea
          aria-label={field.label}
          value={value}
          disabled={pending}
          onChange={(event) => handleValueChange(field.name, event.target.value)}
        />
      );
    }
    return (
      <Input
        aria-label={field.label}
        value={value}
        disabled={pending}
        inputMode={field.type === "money" ? "decimal" : undefined}
        type={field.type === "time" ? "time" : "text"}
        onChange={(event) => handleValueChange(field.name, event.target.value)}
      />
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {fields.map((field) => (
        field.type === "target" ? (
          <div key={field.name} className="block space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">{field.label}</span>
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground">
              {TARGET_FIELD_MESSAGE}
            </p>
          </div>
        ) : (
          <label key={field.name} className="block space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">{field.label}</span>
            {renderControl(field)}
          </label>
        )
      ))}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {editableFields.length > 0 ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={handleSubmit} disabled={pending}>
            Save info
          </Button>
        </div>
      ) : null}
    </div>
  );
}
