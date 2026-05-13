"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

type MissingField = {
  name: string;
  label: string;
  type?: string;
};

type Props = {
  fields: MissingField[];
  pending: boolean;
  onSave: (payload: Record<string, string>) => void;
};

export function AIActionFieldEditor({ fields, pending, onSave }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  function handleSubmit() {
    onSave(values);
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {fields.map((field) => (
        <label key={field.name} className="block space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">{field.label}</span>
          <Input
            aria-label={field.label}
            value={values[field.name] ?? ""}
            inputMode={field.type === "money" ? "decimal" : undefined}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                [field.name]: event.target.value,
              }))
            }
          />
        </label>
      ))}
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={handleSubmit} disabled={pending}>
          Save info
        </Button>
      </div>
    </div>
  );
}
