"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavigationItem } from "@/features/shell/domain/types";
import { useSidebar } from "@/features/shell/application/sidebar-context";
import { cn } from "@/shared/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

export function SidebarNavItem({ item, isMobile = false }: { item: NavigationItem; isMobile?: boolean }) {
  const pathname = usePathname();
  const { isCollapsed } = useSidebar();

  // On mobile, always show expanded style
  const collapsed = isMobile ? false : isCollapsed;

  const isActive =
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

  const Icon = item.icon;

  const linkContent = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span
        className={cn(
          "truncate overflow-hidden whitespace-nowrap transition-[opacity,transform] duration-300 ease-out",
          collapsed ? "translate-x-1 opacity-0" : "translate-x-0 opacity-100",
        )}
      >
        {item.label}
      </span>
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}
