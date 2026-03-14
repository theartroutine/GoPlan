"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { NotificationBell } from "@/features/notifications/presentation/notification-bell";
import { useSidebar } from "@/features/shell/application/sidebar-context";
import { Button } from "@/shared/ui/button";

import { DashboardNavbar } from "./dashboard-navbar";

const PAGE_TITLES: Record<string, string> = {
  "/friends": "Friends",
  "/profile": "Profile",
  "/settings": "Settings",
};

export function TopNavbar() {
  const pathname = usePathname();
  const { openMobile } = useSidebar();

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-sm lg:px-6">
      {/* Hamburger — mobile only */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden shrink-0"
        onClick={openMobile}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1 min-w-0">
        {pathname === "/" ? (
          <DashboardNavbar />
        ) : (
          <h1 className="text-sm font-semibold">
            {PAGE_TITLES[pathname] ?? ""}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <NotificationBell />
      </div>
    </header>
  );
}
