"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import type { PlaceSuggestion } from "@/features/trips/infrastructure/places-api";
import {
  bffAutocompletePlaces,
  bffGetPlaceDetails,
  getPlacePhotoUrl,
} from "@/features/trips/infrastructure/places-api";
import { Input } from "@/shared/ui/input";

export type DestinationPickerValue = {
  destination: string;
  destination_place_id: string;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_country_code: string;
  cover_image_url: string;
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
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [sessionToken, setSessionToken] = useState<string>(() => crypto.randomUUID());
  // True when the user has committed to a selection (not just typed)
  const [isCommitted, setIsCommitted] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Debounced autocomplete call
  useEffect(() => {
    if (isCommitted) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (inputValue.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await bffAutocompletePlaces(inputValue.trim(), sessionToken);
        setSuggestions(results);
        setIsOpen(results.length > 0);
        setActiveIndex(-1);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, sessionToken, isCommitted]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setInputValue(text);
      onRawInputChange?.(text);
      if (isCommitted) {
        setIsCommitted(false);
        setSessionToken(crypto.randomUUID());
        onChange(null);
      }
    },
    [isCommitted, onChange, onRawInputChange],
  );

  const handleSelect = useCallback(
    async (suggestion: PlaceSuggestion) => {
      const displayName =
        suggestion.secondary_text
          ? `${suggestion.main_text}, ${suggestion.secondary_text}`
          : suggestion.main_text;

      setInputValue(displayName);
      setIsOpen(false);
      setSuggestions([]);
      setIsLoading(true);

      try {
        const details = await bffGetPlaceDetails(suggestion.place_id, sessionToken);
        if (details) {
          const coverUrl = details.photo_reference
            ? getPlacePhotoUrl(details.photo_reference)
            : "";
          onChange({
            destination: details.name || displayName,
            destination_place_id: details.place_id,
            destination_lat: details.lat,
            destination_lng: details.lng,
            destination_country_code: details.country_code,
            cover_image_url: coverUrl,
          });
          setInputValue(details.name || displayName);
        }
      } finally {
        setIsLoading(false);
        setIsCommitted(true);
        // Rotate token — next search starts a fresh session
        setSessionToken(crypto.randomUUID());
      }
    },
    [sessionToken, onChange],
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
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground pointer-events-none" />
        ) : (
          <MapPin className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul
          id="destination-listbox"
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-md overflow-hidden"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.place_id}
              role="option"
              aria-selected={i === activeIndex}
              className={[
                "flex items-start gap-2.5 px-3 py-2.5 cursor-pointer text-sm min-h-[44px] transition-colors",
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
                <span className="font-medium">{s.main_text}</span>
                {s.secondary_text && (
                  <span className="block text-xs text-muted-foreground">{s.secondary_text}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
