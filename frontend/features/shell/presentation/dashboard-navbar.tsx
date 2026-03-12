"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "ongoing", label: "Ongoing" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
] as const;

type FilterKey = (typeof FILTER_TABS)[number]["key"];

export function DashboardNavbar() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  return (
    <div className="flex w-full items-center justify-between gap-2 sm:gap-4">
      {/* Filter tabs — horizontally scrollable on mobile */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeFilter === tab.key
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + Create — hidden on small mobile, visible sm+ */}
      <div className="hidden items-center gap-2 sm:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="h-8 w-56 pl-8 text-sm"
                disabled
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>Coming soon</TooltipContent>
        </Tooltip>
        <Button size="sm" className="h-8 gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Create
        </Button>
      </div>

      {/* Create button only — visible on small mobile */}
      <Button size="icon-sm" className="sm:hidden shrink-0">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
