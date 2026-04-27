"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  CreateActivityPayload,
  PatchActivityPayload,
  TimelineActivity,
  TimelineActivityStatus,
  TimelineActivityTimeMode,
  TimelineCustomTypeMeta,
  TimelineSystemTypeMeta,
  TripMemberItem,
} from "@/features/trips/domain/types";
import {
  ActivityLocationField,
  type ActivityLocationValue,
} from "@/features/trips/presentation/activity-location-field";
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
  onDirtyChange?: (dirty: boolean) => void;
  onSubmit: (payload: CreateActivityPayload | PatchActivityPayload) => void;
};

type LocalState = {
  title: string;
  time_mode: TimelineActivityTimeMode;
  start_time: string;
  end_time: string;
  type_choice: string;
  assignee_user_id: string;
  location: ActivityLocationValue;
  location_note: string;
  note: string;
  meeting_point: string;
  contact_name: string;
  contact_phone: string;
  booking_reference: string;
  external_link: string;
  reminder_offsets_minutes: number[];
};

function isTimedMode(mode: TimelineActivityTimeMode): boolean {
  return mode === "AT_TIME" || mode === "TIME_RANGE";
}

function initialStateFrom(activity?: TimelineActivity): LocalState {
  if (!activity) {
    return {
      title: "",
      time_mode: "AT_TIME",
      start_time: "",
      end_time: "",
      type_choice: "system:OTHER",
      assignee_user_id: "",
      location: { label: "", place: null },
      location_note: "",
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

  return {
    title: activity.title,
    time_mode: activity.time_mode,
    start_time: activity.start_time?.slice(0, 5) ?? "",
    end_time: activity.end_time?.slice(0, 5) ?? "",
    type_choice: typeChoice,
    assignee_user_id: activity.assignee?.id ?? "",
    location: {
      label: activity.location.location_label,
      place: activity.location.place,
    },
    location_note: activity.location.location_note,
    note: activity.note,
    meeting_point: activity.meeting_point,
    contact_name: activity.contact_name,
    contact_phone: activity.contact_phone,
    booking_reference: activity.booking_reference,
    external_link: activity.external_link,
    reminder_offsets_minutes: isTimedMode(activity.time_mode)
      ? activity.reminder_offsets_minutes ?? []
      : [],
  };
}

export function TimelineActivityForm(props: ActivityFormProps) {
  const formKey = props.initial?.id ?? "create";

  return <TimelineActivityFormFields key={formKey} {...props} />;
}

function TimelineActivityFormFields({
  members,
  systemTypes,
  customTypes,
  initial,
  submitting,
  errorMessage,
  onCancel,
  onDirtyChange,
  onSubmit,
}: ActivityFormProps) {
  const [s, setS] = useState<LocalState>(() => initialStateFrom(initial));
  const [localError, setLocalError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const onDirtyChangeRef = useRef(onDirtyChange);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  useEffect(() => {
    dirtyRef.current = false;
    onDirtyChangeRef.current?.(false);
  }, []);

  const isEdit = !!initial;
  const activeCustomTypes = useMemo(
    () =>
      customTypes.filter(
        (ct) =>
          ct.is_active
          || (initial?.activity_type?.kind === "CUSTOM" && initial.activity_type.id === ct.id),
      ),
    [customTypes, initial],
  );

  function markDirty() {
    if (dirtyRef.current) return;
    dirtyRef.current = true;
    onDirtyChangeRef.current?.(true);
  }

  function update<K extends keyof LocalState>(key: K, value: LocalState[K]) {
    markDirty();
    setLocalError(null);
    setS((prev) => ({ ...prev, [key]: value }));
  }

  function handleScheduleChange(value: TimelineActivityTimeMode) {
    markDirty();
    setLocalError(null);
    setS((prev) => ({
      ...prev,
      time_mode: value,
      ...(value === "AT_TIME" ? { end_time: "" } : {}),
      ...(!isTimedMode(value)
        ? {
            start_time: "",
            end_time: "",
            reminder_offsets_minutes: [],
          }
        : {}),
    }));
  }

  function handleLocationChange(value: ActivityLocationValue) {
    update("location", value);
  }

  function toggleReminder(value: number) {
    markDirty();
    setLocalError(null);
    setS((prev) => {
      const reminders = new Set(prev.reminder_offsets_minutes);
      if (reminders.has(value)) reminders.delete(value);
      else reminders.add(value);

      return {
        ...prev,
        reminder_offsets_minutes: Array.from(reminders).sort((a, b) => b - a),
      };
    });
  }

  function buildPayload(): CreateActivityPayload | null {
    const title = s.title.trim();
    if (!title) {
      setLocalError("Title is required.");
      return null;
    }

    const place = s.location.place;
    const payload: CreateActivityPayload = {
      title,
      time_mode: s.time_mode,
      location_label: s.location.label,
      location_mode: place ? "STRUCTURED" : "MANUAL",
      location_note: s.location_note,
      place,
      note: s.note,
      meeting_point: s.meeting_point,
      contact_name: s.contact_name,
      contact_phone: s.contact_phone,
      booking_reference: s.booking_reference,
      external_link: s.external_link,
      reminder_offsets_minutes: isTimedMode(s.time_mode) ? s.reminder_offsets_minutes : [],
    };

    if (s.time_mode === "AT_TIME") {
      if (!s.start_time) {
        setLocalError("Start time is required.");
        return null;
      }
      payload.start_time = `${s.start_time}:00`;
      payload.end_time = null;
    } else if (s.time_mode === "TIME_RANGE") {
      if (!s.start_time || !s.end_time) {
        setLocalError("Start and end times are required.");
        return null;
      }
      if (s.end_time <= s.start_time) {
        setLocalError("End time must be after start time.");
        return null;
      }
      payload.start_time = `${s.start_time}:00`;
      payload.end_time = `${s.end_time}:00`;
    } else {
      payload.start_time = null;
      payload.end_time = null;
      payload.reminder_offsets_minutes = [];
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
    return payload;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    const payload = buildPayload();
    if (!payload) return;
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="activity-title">Title *</Label>
        <Input
          id="activity-title"
          value={s.title}
          onChange={(event) => update("title", event.target.value)}
          disabled={!!submitting}
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="activity-time-mode">Schedule *</Label>
          <select
            id="activity-time-mode"
            value={s.time_mode}
            onChange={(event) => handleScheduleChange(event.target.value as TimelineActivityTimeMode)}
            disabled={!!submitting}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="ALL_DAY">All day</option>
            <option value="AT_TIME">At time</option>
            <option value="TIME_RANGE">Time range</option>
            <option value="FLEXIBLE">Flexible</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="activity-type">Type *</Label>
          <select
            id="activity-type"
            value={s.type_choice}
            onChange={(event) => update("type_choice", event.target.value)}
            disabled={!!submitting}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <optgroup label="System">
              {systemTypes.map((type) => (
                <option key={type.code} value={`system:${type.code}`}>
                  {type.label}
                </option>
              ))}
            </optgroup>
            {activeCustomTypes.length > 0 ? (
              <optgroup label="Custom">
                {activeCustomTypes.map((type) => (
                  <option key={type.id} value={`custom:${type.id}`}>
                    {type.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </div>
      </div>

      {isTimedMode(s.time_mode) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="activity-start">Start time *</Label>
            <Input
              id="activity-start"
              type="time"
              value={s.start_time}
              onChange={(event) => update("start_time", event.target.value)}
              disabled={!!submitting}
              required
            />
          </div>
          {s.time_mode === "TIME_RANGE" ? (
            <div className="space-y-1.5">
              <Label htmlFor="activity-end">End time *</Label>
              <Input
                id="activity-end"
                type="time"
                value={s.end_time}
                onChange={(event) => update("end_time", event.target.value)}
                disabled={!!submitting}
                required
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <ActivityLocationField
        id="activity-location"
        value={s.location}
        onChange={handleLocationChange}
        disabled={!!submitting}
      />

      <div className="space-y-1.5">
        <Label htmlFor="activity-assignee">Assignee</Label>
        <select
          id="activity-assignee"
          value={s.assignee_user_id}
          onChange={(event) => update("assignee_user_id", event.target.value)}
          disabled={!!submitting}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.user.id} value={member.user.id}>
              {member.user.display_name}
            </option>
          ))}
        </select>
      </div>

      <details className="rounded-md border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">More Details</summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="activity-location-note">Location note</Label>
            <Input
              id="activity-location-note"
              value={s.location_note}
              onChange={(event) => update("location_note", event.target.value)}
              disabled={!!submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="activity-note">Note</Label>
            <Textarea
              id="activity-note"
              value={s.note}
              onChange={(event) => update("note", event.target.value)}
              disabled={!!submitting}
              rows={2}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="activity-meeting-point">Meeting point</Label>
              <Input
                id="activity-meeting-point"
                value={s.meeting_point}
                onChange={(event) => update("meeting_point", event.target.value)}
                disabled={!!submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="activity-booking-reference">Booking reference</Label>
              <Input
                id="activity-booking-reference"
                value={s.booking_reference}
                onChange={(event) => update("booking_reference", event.target.value)}
                disabled={!!submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="activity-contact-name">Contact name</Label>
              <Input
                id="activity-contact-name"
                value={s.contact_name}
                onChange={(event) => update("contact_name", event.target.value)}
                disabled={!!submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="activity-contact-phone">Contact phone</Label>
              <Input
                id="activity-contact-phone"
                value={s.contact_phone}
                onChange={(event) => update("contact_phone", event.target.value)}
                disabled={!!submitting}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="activity-external-link">External link</Label>
            <Input
              id="activity-external-link"
              value={s.external_link}
              onChange={(event) => update("external_link", event.target.value)}
              placeholder="https://…"
              disabled={!!submitting}
            />
          </div>

          {isTimedMode(s.time_mode) ? (
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
                      disabled={!!submitting}
                      aria-pressed={active}
                      className={[
                        "rounded-full border px-3 py-0.5 text-xs",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground",
                      ].join(" ")}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </details>

      {localError || errorMessage ? (
        <p className="text-sm text-destructive" aria-live="polite">
          {localError ?? errorMessage}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={!!submitting}>
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Add activity"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={!!submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// Re-export status for consumer convenience.
export type { TimelineActivityStatus };
