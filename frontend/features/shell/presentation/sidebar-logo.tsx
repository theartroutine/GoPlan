"use client";

import { useSidebar } from "@/features/shell/application/sidebar-context";
import { cn } from "@/shared/lib/utils";

type SidebarLogoProps = {
  className?: string;
};

export function SidebarLogo({
  className,
}: SidebarLogoProps) {
  const { isCollapsed } = useSidebar();

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center overflow-hidden px-4",
        className,
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground text-sm font-bold text-background">
        G
      </span>
      <span
        className={cn(
          "ml-2 overflow-hidden whitespace-nowrap text-sm font-semibold tracking-tight transition-[opacity,transform] duration-260 ease-out",
          isCollapsed ? "translate-x-1 opacity-0" : "translate-x-0 opacity-100",
        )}
      >
        GoPlan
      </span>
    </div>
  );
}
