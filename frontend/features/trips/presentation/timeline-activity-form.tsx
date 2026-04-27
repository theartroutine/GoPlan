"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";

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
import type { LocationSuggestion } from "@/features/trips/infrastructure/location-search-api";
import {
  bffLookupLocation,
  bffSuggestLocations,
} from "@/features/trips/infrastructure/location-search-api";
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

type StructuredPlaceSelection = {
  provider: "here";
  provider_id: string;
  title: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

type StructuredLocationSearchProps = {
  inputValue: string;
  selectedProviderId: string;
  onInputChange: (value: string) => void;
  onSelect: (place: StructuredPlaceSelection) => void;
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

function StructuredLocationSearch({
  inputValue,
  selectedProviderId,
  onInputChange,
  onSelect,
}: StructuredLocationSearchProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const lookupRequestIdRef = useRef(0);
  const pendingSelectionQueryRef = useRef("");
  const requestIdRef = useRef(0);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const inputId = useId();
  const listboxId = useId();

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      lookupAbortRef.current?.abort();
      suggestAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const query = inputValue.trim();

    if (debounceRef.current) clearTimeout(debounceRef.current);
    suggestAbortRef.current?.abort();

    if (
      selectedProviderId
      || query.length < 2
      || query === pendingSelectionQueryRef.current
    ) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      setActiveIndex(-1);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      suggestAbortRef.current = controller;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);

      try {
        const results = await bffSuggestLocations(query, controller.signal);
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setSuggestions(results);
        setIsOpen(results.length > 0);
        setActiveIndex(-1);
      } finally {
        if (suggestAbortRef.current === controller) {
          suggestAbortRef.current = null;
        }
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, selectedProviderId]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      lookupAbortRef.current?.abort();
      lookupAbortRef.current = null;
      lookupRequestIdRef.current += 1;
      pendingSelectionQueryRef.current = "";
      onInputChange(e.target.value);
    },
    [onInputChange],
  );

  const handleSelect = useCallback(
    async (suggestion: LocationSuggestion) => {
      pendingSelectionQueryRef.current = suggestion.title;
      onInputChange(suggestion.title);
      setIsOpen(false);
      setSuggestions([]);
      setActiveIndex(-1);
      suggestAbortRef.current?.abort();
      lookupAbortRef.current?.abort();

      const controller = new AbortController();
      lookupAbortRef.current = controller;
      const lookupRequestId = lookupRequestIdRef.current + 1;
      lookupRequestIdRef.current = lookupRequestId;
      setIsLoading(true);

      try {
        const details = await bffLookupLocation(suggestion.provider_id, controller.signal);
        if (controller.signal.aborted || lookupRequestId !== lookupRequestIdRef.current) {
          return;
        }

        onSelect({
          provider: details?.destination_provider ?? suggestion.provider,
          provider_id: details?.destination_provider_id ?? suggestion.provider_id,
          title: suggestion.title,
          address: details?.destination ?? suggestion.subtitle,
          lat: details?.destination_lat ?? null,
          lng: details?.destination_lng ?? null,
        });
      } finally {
        if (lookupAbortRef.current === controller) {
          lookupAbortRef.current = null;
        }
        if (lookupRequestId === lookupRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [onInputChange, onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        void handleSelect(suggestions[activeIndex]);
      } else if (e.key === "Escape") {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    },
    [activeIndex, handleSelect, isOpen, suggestions],
  );

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <Label htmlFor={inputId}>Location search</Label>
      <div className="relative">
        <Input
          id={inputId}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Search HERE locations"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          role="combobox"
          autoComplete="off"
          className="pr-8"
        />
        {isLoading ? (
          <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <MapPin className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md"
        >
          {suggestions.map((suggestion, i) => (
            <li
              key={suggestion.provider_id}
              role="option"
              aria-selected={i === activeIndex}
              className={[
                "flex min-h-[44px] cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm transition-colors",
                i === activeIndex ? "bg-accent" : "hover:bg-accent",
              ].join(" ")}
              onMouseDown={(e) => {
                e.preventDefault();
                void handleSelect(suggestion);
              }}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <span className="font-medium">{suggestion.title}</span>
                {suggestion.subtitle && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {suggestion.subtitle}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

  function clearStructuredPlace(nextLocationLabel = "") {
    setS((prev) => ({
      ...prev,
      location_label: nextLocationLabel,
      place_provider: "",
      place_provider_id: "",
      place_title: "",
      place_address: "",
      place_lat: "",
      place_lng: "",
    }));
  }

  function handleLocationModeChange(value: TimelineLocationMode) {
    setS((prev) => ({
      ...prev,
      location_mode: value,
      ...(value === "MANUAL"
        ? {
            place_provider: "",
            place_provider_id: "",
            place_title: "",
            place_address: "",
            place_lat: "",
            place_lng: "",
          }
        : {}),
    }));
  }

  function handleStructuredLocationSelect(place: StructuredPlaceSelection) {
    setS((prev) => ({
      ...prev,
      location_label: place.title,
      place_provider: place.provider,
      place_provider_id: place.provider_id,
      place_title: place.title,
      place_address: place.address,
      place_lat: place.lat != null ? String(place.lat) : "",
      place_lng: place.lng != null ? String(place.lng) : "",
    }));
  }

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
        setLocalError("Select a location from search results.");
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
          <Label htmlFor="activity-time-mode">Time mode *</Label>
          <select
            id="activity-time-mode"
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
          <Label htmlFor="activity-type">Type *</Label>
          <select
            id="activity-type"
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
        <Label htmlFor="activity-assignee">Assignee</Label>
        <select
          id="activity-assignee"
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
        <Label htmlFor="activity-location-mode">Location mode</Label>
        <select
          id="activity-location-mode"
          value={s.location_mode}
          onChange={(e) => handleLocationModeChange(e.target.value as TimelineLocationMode)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="MANUAL">Manual</option>
          <option value="STRUCTURED">Structured (HERE)</option>
        </select>
      </div>

      {s.location_mode === "MANUAL" ? (
        <div className="space-y-1.5">
          <Label htmlFor="activity-location-label">Location label</Label>
          <Input
            id="activity-location-label"
            value={s.location_label}
            onChange={(e) => update("location_label", e.target.value)}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <StructuredLocationSearch
            inputValue={s.location_label}
            selectedProviderId={s.place_provider_id}
            onInputChange={clearStructuredPlace}
            onSelect={handleStructuredLocationSelect}
          />
          {s.place_provider_id && (
            <div className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{s.place_title}</p>
                {s.place_address && (
                  <p className="truncate text-xs text-muted-foreground">{s.place_address}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Clear selected location"
                onClick={() => clearStructuredPlace()}
              >
                <X />
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="activity-location-note">Location note</Label>
        <Input
          id="activity-location-note"
          value={s.location_note}
          onChange={(e) => update("location_note", e.target.value)}
        />
      </div>

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
