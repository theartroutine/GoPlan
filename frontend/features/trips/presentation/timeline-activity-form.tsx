"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  CreateActivityPayload,
  PatchActivityPayload,
  TimelineActivity,
  TimelineActivityStatus,
  TimelineActivityTimeMode,
  TimelineCustomTypeMeta,
  TimelineLocationMode,
  TimelineSystemTypeMeta,
  TripMemberItem,
} from "@/features/trips/domain/types";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

const REMINDER_PRESETS: Array<{ value: number; label: string }> = [
  { value: 10080, label: "7d" },
  { value: 1440, label: "1d" },
  { value: 120, label: "2h" },
  { value: 30, label: "30m" },
  { value: 15, label: "15m" },
];

type ActivityFormProps = {
  members: TripMemberItem[];
  systemTypes: TimelineSystemTypeMeta[];
  customTypes: TimelineCustomTypeMeta[];
  initial?: TimelineActivity;
  submitting?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onSubmit: (payload: CreateActivityPayload | PatchActivityPayload) => void;
};

type LocalState = {
  title: string;
  time_mode: TimelineActivityTimeMode;
  start_time: string;
  end_time: string;
  type_choice: string; // "system:CODE" or "custom:UUID"
  assignee_user_id: string;
  location_mode: TimelineLocationMode;
  location_label: string;
  location_note: string;
  place_provider: string;
  place_provider_id: string;
  place_title: string;
  place_address: string;
  place_lat: string;
  place_lng: string;
  note: string;
  meeting_point: string;
  contact_name: string;
  contact_phone: string;
  booking_reference: string;
  external_link: string;
  reminder_offsets_minutes: number[];
};

function initialStateFrom(activity?: TimelineActivity): LocalState {
  if (!activity) {
    return {
      title: "",
      time_mode: "AT_TIME",
      start_time: "",
      end_time: "",
      type_choice: "system:OTHER",
      assignee_user_id: "",
      location_mode: "MANUAL",
      location_label: "",
      location_note: "",
      place_provider: "",
      place_provider_id: "",
      place_title: "",
      place_address: "",
      place_lat: "",
      place_lng: "",
      note: "",
      meeting_point: "",
      contact_name: "",
      contact_phone: "",
      booking_reference: "",
      external_link: "",
      reminder_offsets_minutes: [],
    };
  }
  let typeChoice = "system:OTHER";
  if (activity.activity_type?.kind === "SYSTEM") typeChoice = `system:${activity.activity_type.code}`;
  else if (activity.activity_type?.kind === "CUSTOM") typeChoice = `custom:${activity.activity_type.id}`;
  const place = activity.location.place;
  return {
    title: activity.title,
    time_mode: activity.time_mode,
    start_time: activity.start_time?.slice(0, 5) ?? "",
    end_time: activity.end_time?.slice(0, 5) ?? "",
    type_choice: typeChoice,
    assignee_user_id: activity.assignee?.id ?? "",
    location_mode: activity.location.location_mode,
    location_label: activity.location.location_label,
    location_note: activity.location.location_note,
    place_provider: place?.provider ?? "",
    place_provider_id: place?.provider_id ?? "",
    place_title: place?.title ?? "",
    place_address: place?.address ?? "",
    place_lat: place?.lat != null ? String(place.lat) : "",
    place_lng: place?.lng != null ? String(place.lng) : "",
    note: activity.note,
    meeting_point: activity.meeting_point,
    contact_name: activity.contact_name,
    contact_phone: activity.contact_phone,
    booking_reference: activity.booking_reference,
    external_link: activity.external_link,
    reminder_offsets_minutes: activity.reminder_offsets_minutes ?? [],
  };
}

export function TimelineActivityForm({
  members,
  systemTypes,
  customTypes,
  initial,
  submitting,
  errorMessage,
  onCancel,
  onSubmit,
}: ActivityFormProps) {
  const [s, setS] = useState<LocalState>(() => initialStateFrom(initial));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setS(initialStateFrom(initial));
  }, [initial]);

  const isEdit = !!initial;
  const update = <K extends keyof LocalState>(key: K, value: LocalState[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  const activeCustomTypes = useMemo(
    () => customTypes.filter((ct) => ct.is_active || initial?.activity_type?.kind === "CUSTOM" && initial.activity_type.id === ct.id),
    [customTypes, initial],
  );

  function toggleReminder(value: number) {
    setS((prev) => {
      const set = new Set(prev.reminder_offsets_minutes);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...prev, reminder_offsets_minutes: Array.from(set).sort((a, b) => b - a) };
    });
  }

  function buildPayload(): CreateActivityPayload | null {
    const title = s.title.trim();
    if (!title) {
      setLocalError("Title is required.");
      return null;
    }
    const payload: CreateActivityPayload = {
      title,
      time_mode: s.time_mode,
      location_mode: s.location_mode,
      location_label: s.location_label,
      location_note: s.location_note,
      note: s.note,
      meeting_point: s.meeting_point,
      contact_name: s.contact_name,
      contact_phone: s.contact_phone,
      booking_reference: s.booking_reference,
      external_link: s.external_link,
      reminder_offsets_minutes: s.reminder_offsets_minutes,
    };
    if (s.time_mode === "AT_TIME") {
      if (!s.start_time) { setLocalError("Start time is required."); return null; }
      payload.start_time = `${s.start_time}:00`;
      payload.end_time = null;
    } else if (s.time_mode === "TIME_RANGE") {
      if (!s.start_time || !s.end_time) { setLocalError("Start and end times are required."); return null; }
      if (s.end_time <= s.start_time) { setLocalError("End time must be after start time."); return null; }
      payload.start_time = `${s.start_time}:00`;
      payload.end_time = `${s.end_time}:00`;
    } else {
      payload.start_time = null;
      payload.end_time = null;
    }
    if (s.type_choice.startsWith("system:")) {
      payload.system_type = s.type_choice.slice("system:".length);
      payload.custom_type_id = null;
    } else if (s.type_choice.startsWith("custom:")) {
      payload.system_type = "";
      payload.custom_type_id = s.type_choice.slice("custom:".length);
    } else {
      setLocalError("Activity type is required.");
      return null;
    }
    payload.assignee_user_id = s.assignee_user_id || null;
    if (s.location_mode === "STRUCTURED") {
      if (!s.place_provider || !s.place_provider_id || !s.place_title) {
        setLocalError("Structured location requires provider, provider id, and title.");
        return null;
      }
      payload.place = {
        provider: s.place_provider,
        provider_id: s.place_provider_id,
        title: s.place_title,
        address: s.place_address,
        lat: s.place_lat ? Number(s.place_lat) : null,
        lng: s.place_lng ? Number(s.place_lng) : null,
      };
    } else {
      payload.place = null;
    }
    return payload;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError(null);
    const payload = buildPayload();
    if (!payload) return;
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="space-y-1.5">
        <Label htmlFor="activity-title">Title *</Label>
        <Input
          id="activity-title"
          value={s.title}
          onChange={(e) => update("title", e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Time mode *</Label>
          <select
            value={s.time_mode}
            onChange={(e) => update("time_mode", e.target.value as TimelineActivityTimeMode)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="ALL_DAY">All day</option>
            <option value="AT_TIME">At time</option>
            <option value="TIME_RANGE">Time range</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Type *</Label>
          <select
            value={s.type_choice}
            onChange={(e) => update("type_choice", e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <optgroup label="System">
              {systemTypes.map((t) => (
                <option key={t.code} value={`system:${t.code}`}>{t.label}</option>
              ))}
            </optgroup>
            {activeCustomTypes.length > 0 && (
              <optgroup label="Custom">
                {activeCustomTypes.map((t) => (
                  <option key={t.id} value={`custom:${t.id}`}>{t.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {(s.time_mode === "AT_TIME" || s.time_mode === "TIME_RANGE") && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="activity-start">Start time *</Label>
            <Input
              id="activity-start"
              type="time"
              value={s.start_time}
              onChange={(e) => update("start_time", e.target.value)}
              required
            />
          </div>
          {s.time_mode === "TIME_RANGE" && (
            <div className="space-y-1.5">
              <Label htmlFor="activity-end">End time *</Label>
              <Input
                id="activity-end"
                type="time"
                value={s.end_time}
                onChange={(e) => update("end_time", e.target.value)}
                required
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Assignee</Label>
        <select
          value={s.assignee_user_id}
          onChange={(e) => update("assignee_user_id", e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.user.id} value={m.user.id}>{m.user.display_name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>Location mode</Label>
        <select
          value={s.location_mode}
          onChange={(e) => update("location_mode", e.target.value as TimelineLocationMode)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="MANUAL">Manual</option>
          <option value="STRUCTURED">Structured (HERE)</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="activity-location-label">Location label</Label>
        <Input
          id="activity-location-label"
          value={s.location_label}
          onChange={(e) => update("location_label", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="activity-location-note">Location note</Label>
        <Input
          id="activity-location-note"
          value={s.location_note}
          onChange={(e) => update("location_note", e.target.value)}
        />
      </div>

      {s.location_mode === "STRUCTURED" && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="provider (e.g. here)"
              value={s.place_provider}
              onChange={(e) => update("place_provider", e.target.value)}
            />
            <Input
              placeholder="provider id"
              value={s.place_provider_id}
              onChange={(e) => update("place_provider_id", e.target.value)}
            />
          </div>
          <Input
            placeholder="place title"
            value={s.place_title}
            onChange={(e) => update("place_title", e.target.value)}
          />
          <Input
            placeholder="place address"
            value={s.place_address}
            onChange={(e) => update("place_address", e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="lat"
              value={s.place_lat}
              onChange={(e) => update("place_lat", e.target.value)}
            />
            <Input
              placeholder="lng"
              value={s.place_lng}
              onChange={(e) => update("place_lng", e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="activity-note">Note</Label>
        <Textarea
          id="activity-note"
          value={s.note}
          onChange={(e) => update("note", e.target.value)}
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          placeholder="Meeting point"
          value={s.meeting_point}
          onChange={(e) => update("meeting_point", e.target.value)}
        />
        <Input
          placeholder="Booking reference"
          value={s.booking_reference}
          onChange={(e) => update("booking_reference", e.target.value)}
        />
        <Input
          placeholder="Contact name"
          value={s.contact_name}
          onChange={(e) => update("contact_name", e.target.value)}
        />
        <Input
          placeholder="Contact phone"
          value={s.contact_phone}
          onChange={(e) => update("contact_phone", e.target.value)}
        />
      </div>
      <Input
        placeholder="External link (https://…)"
        value={s.external_link}
        onChange={(e) => update("external_link", e.target.value)}
      />

      {(s.time_mode === "AT_TIME" || s.time_mode === "TIME_RANGE") && (
        <div className="space-y-1.5">
          <Label>Reminders</Label>
          <div className="flex flex-wrap gap-2">
            {REMINDER_PRESETS.map((preset) => {
              const active = s.reminder_offsets_minutes.includes(preset.value);
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => toggleReminder(preset.value)}
                  className={`rounded-full border px-3 py-0.5 text-xs ${
                    active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(localError || errorMessage) && (
        <p className="text-sm text-destructive">{localError ?? errorMessage}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={!!submitting}>
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Add activity"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// Re-export status for consumer convenience.
export type { TimelineActivityStatus };
