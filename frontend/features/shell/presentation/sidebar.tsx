"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  LayoutDashboard,
  LogOut,
  UserCircle,
  Users,
  X,
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
];

function SidebarContent({ isMobile }: { isMobile: boolean }) {
  const { logout } = useAuth();
  const { isCollapsed, closeMobile } = useSidebar();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  // On mobile, always show expanded content
  const collapsed = isMobile ? false : isCollapsed;

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    await logout();
    router.replace("/login");
  }, [logout, router]);

  const logoutButton = (
    <Button
      variant="ghost"
      className="w-full justify-start gap-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
          "overflow-hidden whitespace-nowrap transition-[opacity,transform] duration-300 ease-out",
          collapsed ? "translate-x-1 opacity-0" : "translate-x-0 opacity-100",
        )}
      >
        Log out
      </span>
    </Button>
  );

  return (
    <>
      <div className="flex h-14 items-center border-b border-border">
        <SidebarLogo />
        {isMobile && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="mr-3 shrink-0 text-muted-foreground"
            onClick={closeMobile}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div
        className={cn(
          "flex-1 overflow-y-auto py-4",
          collapsed ? "px-2" : "px-3",
        )}
      >
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem key={item.key} item={item} isMobile={isMobile} />
          ))}
        </nav>
      </div>

      <div className={cn("pb-3", collapsed ? "px-2" : "px-3")}>
        <Separator className="mb-3" />
        <SidebarUserSection />
        <div className={cn("mt-2", collapsed ? "px-0" : "px-1")}>
          {collapsed && !isMobile ? (
            <Tooltip>
              <TooltipTrigger asChild>{logoutButton}</TooltipTrigger>
              <TooltipContent side="right">Log out</TooltipContent>
            </Tooltip>
          ) : (
            logoutButton
          )}
        </div>
      </div>
    </>
  );
}

export function Sidebar() {
  const { isMobileOpen, closeMobile, isCollapsed } = useSidebar();
  const pathname = usePathname();

  // Auto-close mobile drawer on route change
  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "relative hidden h-screen shrink-0 flex-col overflow-x-hidden border-r border-border bg-background transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex",
          isCollapsed ? "w-[68px]" : "w-64",
        )}
      >
        <SidebarContent isMobile={false} />
      </aside>

      {/* Mobile overlay drawer */}
      <Dialog.Root
        open={isMobileOpen}
        onOpenChange={(open) => {
          if (!open) closeMobile();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 lg:hidden" />
          <Dialog.Content
            className="fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col bg-background shadow-xl animate-in slide-in-from-left duration-200 lg:hidden"
            aria-label="Navigation"
          >
            <Dialog.Title className="sr-only">Navigation Menu</Dialog.Title>
            <SidebarContent isMobile={true} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
