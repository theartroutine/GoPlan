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

export function SidebarNavItem({ item }: { item: NavigationItem }) {
  const pathname = usePathname();
  const { isCollapsed } = useSidebar();

  const isActive =
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

  const Icon = item.icon;

  const linkContent = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-[color,background-color,padding] duration-200",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        isCollapsed ? "justify-center px-0" : "px-3",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span
        className={cn(
          "truncate overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-200",
          isCollapsed ? "max-w-0 opacity-0" : "max-w-48 opacity-100",
        )}
      >
        {item.label}
      </span>
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}
