"use client";

import { useState } from "react";

import type { TimelineCustomTypeMeta } from "@/features/trips/domain/types";
import {
  bffCreateTimelineCustomType,
  bffDeleteTimelineCustomType,
  bffPatchTimelineCustomType,
} from "@/features/trips/infrastructure/trips-api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

type Props = {
  tripId: string;
  customTypes: TimelineCustomTypeMeta[];
  onChanged: () => void;
};

function extractErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { detail?: string; error_code?: string } } })?.response?.data;
  return data?.detail ?? fallback;
}

export function TimelineCustomTypeManager({ tripId, customTypes, onChanged }: Props) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await bffCreateTimelineCustomType(tripId, { name: newName.trim() });
      setNewName("");
      onChanged();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to create custom type."));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(ct: TimelineCustomTypeMeta) {
    setError(null);
    try {
      await bffPatchTimelineCustomType(tripId, ct.id, { is_active: !ct.is_active });
      onChanged();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update custom type."));
    }
  }

  async function handleDelete(ct: TimelineCustomTypeMeta) {
    if (!window.confirm(`Delete custom type "${ct.name}"?`)) return;
    setError(null);
    try {
      await bffDeleteTimelineCustomType(tripId, ct.id);
      onChanged();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete custom type."));
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h4 className="text-sm font-semibold">Custom activity types</h4>
      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New custom type name"
        />
        <Button type="submit" disabled={creating || !newName.trim()}>
          Add
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {customTypes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No custom types yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {customTypes.map((ct) => (
            <li key={ct.id} className="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1">
              <span className={ct.is_active ? "" : "text-muted-foreground line-through"}>
                {ct.name}
              </span>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => handleToggleActive(ct)}>
                  {ct.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => handleDelete(ct)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
