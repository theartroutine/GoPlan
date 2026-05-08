"use client";

import { Search } from "lucide-react";

import type { ExpenseFilter } from "@/features/trips/presentation/expenses-url-state";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type ExpenseListControlsProps = {
  filter: ExpenseFilter;
  query: string;
  counts: Record<ExpenseFilter, number>;
  onFilterChange: (filter: ExpenseFilter) => void;
  onQueryChange: (query: string) => void;
};

const FILTER_LABELS: Record<ExpenseFilter, string> = {
  all: "All",
  attention: "Need attention",
  missing: "Missing",
  overfunded: "Overfunded",
};

const FILTERS: ExpenseFilter[] = ["all", "attention", "missing", "overfunded"];

export function ExpenseListControls({
  filter,
  query,
  counts,
  onFilterChange,
  onQueryChange,
}: ExpenseListControlsProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-2" aria-label="Expense filters">
        {FILTERS.map((item) => (
          <Button
            key={item}
            type="button"
            variant={filter === item ? "default" : "outline"}
            size="sm"
            className={cn("h-8 rounded-full px-3", filter !== item && "bg-background")}
            onClick={() => onFilterChange(item)}
          >
            {FILTER_LABELS[item]} {counts[item]}
          </Button>
        ))}
      </div>

      <div className="relative w-full md:w-64">
        <Label htmlFor="expenses-search" className="sr-only">
          Search expenses
        </Label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="expenses-search"
          name="expenses-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search expenses..."
          autoComplete="off"
          className="h-9 pl-8"
        />
      </div>
    </div>
  );
}
