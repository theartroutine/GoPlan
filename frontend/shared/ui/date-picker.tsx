"use client";

import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Calendar } from "@/shared/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/utils";

interface DatePickerProps {
  id?: string;
  value?: string;
  onChange: (date: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  disabledDates?: string[];
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  minDate,
  disabledDates = [],
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const disabledDateSet = React.useMemo(() => new Set(disabledDates), [disabledDates]);

  const parsed = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  const triggerAriaLabel = selected
    ? `${placeholder}. Selected ${format(selected, "PPP")}`
    : placeholder;
  const isDateDisabled = React.useCallback(
    (date: Date) => {
      if (minDate && date < minDate) return true;
      return disabledDateSet.has(format(date, "yyyy-MM-dd"));
    },
    [disabledDateSet, minDate],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground"
          )}
          aria-label={triggerAriaLabel}
        >
          <CalendarIcon className="mr-2 size-4" />
          {selected ? format(selected, "PPP") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : undefined);
            setOpen(false);
          }}
          disabled={isDateDisabled}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
