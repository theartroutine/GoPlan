"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LogOut,
  PanelLeftOpen,
  Settings,
  UserCircle,
  Users,
} from "lucide-react";

import type { NavigationItem } from "@/features/shell/domain/types";
import { useAuth } from "@/features/auth/application/auth-context";
import { useSidebar } from "@/features/shell/application/sidebar-context";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import { Spinner } from "@/shared/ui/spinner";

import { SidebarLogo } from "./sidebar-logo";
import { SidebarNavItem } from "./sidebar-nav-item";
import { SidebarUserSection } from "./sidebar-user-section";

const NAV_ITEMS: NavigationItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/", icon: LayoutDashboard },
  { key: "friends", label: "Friends", href: "/friends", icon: Users },
  { key: "profile", label: "Profile", href: "/profile", icon: UserCircle },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const { logout } = useAuth();
  const { isCollapsed, toggle } = useSidebar();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    await logout();
    router.replace("/login");
  }, [logout, router]);

  const logoutButton = (
    <Button
      variant="ghost"
      className={cn(
        "w-full gap-3 text-destructive hover:text-destructive hover:bg-destructive/10 transition-[padding] duration-200",
        isCollapsed ? "justify-center px-0" : "justify-start",
      )}
      onClick={handleLogout}
      disabled={loggingOut}
    >
      {loggingOut ? (
        <Spinner className="h-4 w-4 shrink-0" />
      ) : (
        <LogOut className="h-4 w-4 shrink-0" />
      )}
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-200",
          isCollapsed ? "max-w-0 opacity-0" : "max-w-24 opacity-100",
        )}
      >
        Log out
      </span>
    </Button>
  );

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200",
        isCollapsed ? "w-[68px]" : "w-64",
      )}
    >
      <SidebarLogo />

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <nav className="flex flex-col gap-1">
          <div
            className={cn(
              "overflow-hidden transition-[opacity,max-height] duration-200",
              isCollapsed ? "max-h-10 opacity-100" : "max-h-0 opacity-0",
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggle}
                  className="flex w-full items-center justify-center gap-3 rounded-md px-0 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                >
                  <PanelLeftOpen className="h-4 w-4 shrink-0" />
                  <span className="max-w-0 overflow-hidden" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          </div>
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem key={item.key} item={item} />
          ))}
        </nav>
      </div>

      <div className="px-3 pb-3">
        <Separator className="mb-3" />
        <SidebarUserSection />
        <div className="mt-2 px-1">
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>{logoutButton}</TooltipTrigger>
              <TooltipContent side="right">Log out</TooltipContent>
            </Tooltip>
          ) : (
            logoutButton
          )}
        </div>
      </div>
    </aside>
  );
}
