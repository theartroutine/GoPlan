"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Globe2 } from "lucide-react";

import { getSupportedTimezones } from "@/features/trips/domain/timezones";
import { cn } from "@/shared/lib/utils";
import { Input } from "@/shared/ui/input";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

const MAX_VISIBLE_TIMEZONES = 8;

export function TimezonePicker({ id, value, onChange, required }: Props) {
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const timezones = useMemo(() => getSupportedTimezones(value), [value]);
  const listboxId = `${id}-listbox`;
  const query = inputValue.trim();
  const filteredTimezones = useMemo(() => {
    const matches = query
      ? timezones.filter((timezone) => timezoneMatchesQuery(timezone, query))
      : timezones;

    return matches.slice(0, MAX_VISIBLE_TIMEZONES);
  }, [query, timezones]);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

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

  function selectTimezone(timezone: string) {
    onChange(timezone);
    setInputValue(timezone);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setInputValue(nextValue);
    onChange(nextValue);
    setIsOpen(true);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setIsOpen(true);
      return;
    }

    if (!isOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filteredTimezones.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, -1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectTimezone(filteredTimezones[activeIndex]);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          id={id}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Asia/Ho_Chi_Minh"
          required={required}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen && filteredTimezones.length > 0}
          aria-controls={listboxId}
          autoComplete="off"
          className="pr-8"
        />
        <Globe2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {isOpen && filteredTimezones.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-md"
        >
          {filteredTimezones.map((timezone, index) => (
            <li
              key={timezone}
              role="option"
              aria-selected={timezone === value}
              className={cn(
                "flex min-h-9 cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors",
                index === activeIndex ? "bg-accent" : "hover:bg-accent",
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                selectTimezone(timezone);
              }}
            >
              <Check
                className={cn(
                  "size-3.5 shrink-0",
                  timezone === value ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="truncate">{timezone}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function timezoneMatchesQuery(timezone: string, query: string): boolean {
  const timezoneSearchKey = normalizeTimezoneSearchText(timezone);
  const querySearchKey = normalizeTimezoneSearchText(query);

  return (
    timezoneSearchKey.spaced.includes(querySearchKey.spaced) ||
    timezoneSearchKey.compact.includes(querySearchKey.compact)
  );
}

function normalizeTimezoneSearchText(value: string): { spaced: string; compact: string } {
  const spaced = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[/_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    spaced,
    compact: spaced.replace(/\s/g, ""),
  };
}
