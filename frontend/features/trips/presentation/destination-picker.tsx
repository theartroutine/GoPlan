"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import type { LocationSuggestion } from "@/features/trips/infrastructure/location-search-api";
import {
  bffLookupLocation,
  bffSuggestLocations,
} from "@/features/trips/infrastructure/location-search-api";
import { Input } from "@/shared/ui/input";

export type DestinationPickerValue = {
  destination: string;
  destination_provider: "here";
  destination_provider_id: string;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_country_code: string;
};

type Props = {
  id?: string;
  initialValue?: string;
  /**
   * Called with structured data when the user selects from the dropdown.
   * Called with null when the user modifies the input after a committed selection.
   */
  onChange: (value: DestinationPickerValue | null) => void;
  /**
   * Called on every keystroke with the raw input text.
   * Useful for parent forms that need the text even without a committed selection.
   */
  onRawInputChange?: (text: string) => void;
  required?: boolean;
};

export function DestinationPicker({
  id,
  initialValue = "",
  onChange,
  onRawInputChange,
  required,
}: Props) {
  const [inputValue, setInputValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // True when the user has committed to a selection (not just typed)
  const [isCommitted, setIsCommitted] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastRequestedQueryRef = useRef("");
  const lookupAbortRef = useRef<AbortController | null>(null);
  const lookupRequestIdRef = useRef(0);
  const requestIdRef = useRef(0);
  const suggestAbortRef = useRef<AbortController | null>(null);

  // Close dropdown on click outside
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

  // Debounced suggest call
  useEffect(() => {
    const normalizedQuery = inputValue.trim();

    if (isCommitted) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    suggestAbortRef.current?.abort();

    if (normalizedQuery.length < 2) {
      lastRequestedQueryRef.current = "";
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      setActiveIndex(-1);
      return;
    }

    if (normalizedQuery === lastRequestedQueryRef.current) {
      setIsOpen(suggestions.length > 0);
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
        const results = await bffSuggestLocations(normalizedQuery, controller.signal);
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }

        lastRequestedQueryRef.current = normalizedQuery;
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
  }, [inputValue, isCommitted, suggestions.length]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      lookupAbortRef.current?.abort();
      lookupAbortRef.current = null;
      lookupRequestIdRef.current += 1;
      setIsLoading(false);
      setInputValue(text);
      onRawInputChange?.(text);
      if (isCommitted) {
        setIsCommitted(false);
        onChange(null);
      }
    },
    [isCommitted, onChange, onRawInputChange],
  );

  const handleSelect = useCallback(
    async (suggestion: LocationSuggestion) => {
      const displayName = suggestion.subtitle
        ? `${suggestion.title}, ${suggestion.subtitle}`
        : suggestion.title;

      setInputValue(displayName);
      setIsOpen(false);
      setSuggestions([]);
      suggestAbortRef.current?.abort();
      lookupAbortRef.current?.abort();
      lastRequestedQueryRef.current = "";
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

        if (details) {
          onChange({
            destination: details.destination || displayName,
            destination_provider: details.destination_provider,
            destination_provider_id: details.destination_provider_id,
            destination_lat: details.destination_lat,
            destination_lng: details.destination_lng,
            destination_country_code: details.destination_country_code,
          });
          setInputValue(details.destination || displayName);
        } else {
          onChange({
            destination: displayName,
            destination_provider: "here",
            destination_provider_id: suggestion.provider_id,
            destination_lat: null,
            destination_lng: null,
            destination_country_code: "",
          });
        }
        setIsCommitted(true);
      } finally {
        if (lookupAbortRef.current === controller) {
          lookupAbortRef.current = null;
        }

        if (lookupRequestId === lookupRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
    [isOpen, activeIndex, suggestions, handleSelect],
  );

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          id={id}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Đà Lạt, Tokyo, Paris…"
          required={required}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="destination-listbox"
          role="combobox"
          autoComplete="off"
          className="pr-8"
        />
        {isLoading ? (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground pointer-events-none" />
        ) : (
          <MapPin className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul
          id="destination-listbox"
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.provider_id}
              role="option"
              aria-selected={i === activeIndex}
              className={[
                "flex min-h-[44px] cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm transition-colors",
                i === activeIndex ? "bg-accent" : "hover:bg-accent",
              ].join(" ")}
              onMouseDown={(e) => {
                // Prevent input blur before the click registers
                e.preventDefault();
                void handleSelect(s);
              }}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <span className="font-medium">{s.title}</span>
                {s.subtitle && (
                  <span className="block text-xs text-muted-foreground">{s.subtitle}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
