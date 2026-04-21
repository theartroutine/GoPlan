"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";

import { DASHBOARD_FILTER_TABS, getDashboardFilterStatus } from "@/features/trips/presentation/dashboard-trip-filters";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

export function DashboardNavbar() {
  const searchParams = useSearchParams();
  const activeStatus = getDashboardFilterStatus(searchParams.get("status"));
  const activeFilter = activeStatus ?? "ALL";

  return (
    <div className="flex w-full items-center justify-between gap-2 sm:gap-4">
      {/* Filter tabs — horizontally scrollable on mobile */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        {DASHBOARD_FILTER_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.status ? `/?status=${tab.status}` : "/"}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeFilter === tab.key
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
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
