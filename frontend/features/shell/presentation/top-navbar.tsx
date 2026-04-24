"use client";

import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";

import { NotificationBell } from "@/features/notifications/presentation/notification-bell";
import { useSidebar } from "@/features/shell/application/sidebar-context";
import { Button } from "@/shared/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

import { DashboardNavbar } from "./dashboard-navbar";

const PAGE_TITLES: Record<string, string> = {
  "/friends": "Friends",
  "/friends/requests": "Friend Requests",
  "/friends/add": "Add Friend",
  "/profile": "Profile",
  "/settings": "Settings",
};

const SIDEBAR_LABELS = {
  open: "Open sidebar",
  expand: "Expand sidebar",
  collapse: "Collapse sidebar",
} as const;

export function TopNavbar() {
  const pathname = usePathname();
  const { openMobile, isCollapsed, toggle } = useSidebar();

  const isTripPage =
    pathname.startsWith("/trips/") && pathname.split("/").length > 2;

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-sm lg:px-6">
      {/* Hamburger — mobile only */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden shrink-0"
        onClick={openMobile}
        aria-label={SIDEBAR_LABELS.open}
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden shrink-0 rounded-lg border border-border/60 bg-background text-foreground transition-[background-color,border-color,color] duration-200 hover:bg-accent hover:text-accent-foreground lg:inline-flex"
            onClick={toggle}
            aria-label={isCollapsed ? SIDEBAR_LABELS.expand : SIDEBAR_LABELS.collapse}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isCollapsed ? SIDEBAR_LABELS.expand : SIDEBAR_LABELS.collapse}
        </TooltipContent>
      </Tooltip>

      <div className="flex min-w-0 flex-1 items-center">
        {pathname === "/" ? (
          <DashboardNavbar />
        ) : isTripPage ? (
          <div id="trip-nav-portal" className="flex h-full w-full items-center" />
        ) : (
          <h1 className="text-sm font-semibold">
            {PAGE_TITLES[pathname] ?? ""}
          </h1>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <NotificationBell />
      </div>
    </header>
  );
}
