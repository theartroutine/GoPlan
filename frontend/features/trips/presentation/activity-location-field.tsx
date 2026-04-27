"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import type { TimelinePlace } from "@/features/trips/domain/types";
import type { LocationSuggestion } from "@/features/trips/infrastructure/location-search-api";
import {
  bffLookupLocation,
  bffSuggestLocations,
} from "@/features/trips/infrastructure/location-search-api";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

export type ActivityLocationValue = {
  label: string;
  place: TimelinePlace | null;
};

type ActivityLocationFieldProps = {
  id?: string;
  value: ActivityLocationValue;
  onChange: (value: ActivityLocationValue) => void;
  disabled?: boolean;
};

export function ActivityLocationField({
  id,
  value,
  onChange,
  disabled,
}: ActivityLocationFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-suggestions`;
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchError, setSearchError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const pendingSelectionQueryRef = useRef("");
  const suggestRequestIdRef = useRef(0);
  const lookupRequestIdRef = useRef(0);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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
      suggestAbortRef.current?.abort();
      lookupAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const query = value.label.trim();

    if (debounceRef.current) clearTimeout(debounceRef.current);
    suggestAbortRef.current?.abort();

    if (
      disabled ||
      value.place !== null ||
      query.length < 2 ||
      query === pendingSelectionQueryRef.current
    ) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      setActiveIndex(-1);
      setSearchError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      suggestAbortRef.current = controller;
      const requestId = suggestRequestIdRef.current + 1;
      suggestRequestIdRef.current = requestId;
      setIsLoading(true);

      try {
        const results = await bffSuggestLocations(query, controller.signal);
        if (controller.signal.aborted || requestId !== suggestRequestIdRef.current) return;
        setSuggestions(results);
        setIsOpen(results.length > 0);
        setActiveIndex(-1);
        setSearchError(null);
      } catch {
        if (controller.signal.aborted || requestId !== suggestRequestIdRef.current) return;
        setSuggestions([]);
        setIsOpen(false);
        setActiveIndex(-1);
        setSearchError("Location search is unavailable. You can still enter a place manually.");
      } finally {
        if (suggestAbortRef.current === controller) {
          suggestAbortRef.current = null;
        }
        if (requestId === suggestRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [disabled, value.label, value.place]);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      lookupAbortRef.current?.abort();
      lookupAbortRef.current = null;
      lookupRequestIdRef.current += 1;
      pendingSelectionQueryRef.current = "";
      setSearchError(null);
      onChange({ label: event.target.value, place: null });
    },
    [onChange],
  );

  const selectSuggestion = useCallback(
    async (suggestion: LocationSuggestion) => {
      setIsOpen(false);
      setSuggestions([]);
      setActiveIndex(-1);
      suggestAbortRef.current?.abort();
      lookupAbortRef.current?.abort();
      pendingSelectionQueryRef.current = suggestion.title;
      setSearchError(null);
      onChange({ label: suggestion.title, place: null });

      const controller = new AbortController();
      lookupAbortRef.current = controller;
      const requestId = lookupRequestIdRef.current + 1;
      lookupRequestIdRef.current = requestId;
      setIsLoading(true);

      try {
        const details = await bffLookupLocation(suggestion.provider_id, controller.signal);
        if (controller.signal.aborted || requestId !== lookupRequestIdRef.current) return;
        onChange({
          label: suggestion.title,
          place: {
            provider: details?.destination_provider ?? suggestion.provider,
            provider_id: details?.destination_provider_id ?? suggestion.provider_id,
            title: suggestion.title,
            address: details?.destination ?? suggestion.subtitle,
            lat: details?.destination_lat ?? null,
            lng: details?.destination_lng ?? null,
          },
        });
      } finally {
        if (lookupAbortRef.current === controller) {
          lookupAbortRef.current = null;
        }
        if (requestId === lookupRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [onChange],
  );

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, -1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      void selectSuggestion(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <Label htmlFor={inputId}>Location</Label>
      <div className="relative">
        <Input
          id={inputId}
          value={value.label}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Search or enter a place…"
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          aria-controls={listboxId}
          aria-expanded={isOpen}
          role="combobox"
          className="pr-8"
        />
        {isLoading ? (
          <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <MapPin className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>

      {isOpen && suggestions.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md"
        >
          {suggestions.map((suggestion, index) => (
            <li
              id={`${listboxId}-option-${index}`}
              key={suggestion.provider_id}
              role="option"
              aria-selected={index === activeIndex}
              className={[
                "flex min-h-[44px] cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm transition-colors",
                index === activeIndex ? "bg-accent" : "hover:bg-accent",
              ].join(" ")}
              onMouseDown={(event) => {
                event.preventDefault();
                void selectSuggestion(suggestion);
              }}
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <span className="font-medium">{suggestion.title}</span>
                {suggestion.subtitle ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {suggestion.subtitle}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {searchError ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {searchError}
        </p>
      ) : null}
    </div>
  );
}
