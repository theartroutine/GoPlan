"use client";

import { PanelLeftClose } from "lucide-react";

import { useSidebar } from "@/features/shell/application/sidebar-context";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

type SidebarLogoProps = {
  className?: string;
  showCollapseButton?: boolean;
};

export function SidebarLogo({
  className,
  showCollapseButton = true,
}: SidebarLogoProps) {
  const { isCollapsed, toggle } = useSidebar();

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center overflow-hidden transition-[padding] duration-200",
        isCollapsed ? "justify-center px-2" : "px-4",
        className,
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground text-sm font-bold text-background">
        G
      </span>
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap text-sm font-semibold tracking-tight transition-[opacity,max-width] duration-200",
          isCollapsed ? "ml-0 max-w-0 opacity-0" : "ml-2 max-w-24 opacity-100",
        )}
      >
        GoPlan
      </span>
      <div
        className={cn(
          "overflow-hidden transition-[opacity,max-width,margin] duration-200",
          !showCollapseButton || isCollapsed
            ? "ml-0 max-w-0 opacity-0"
            : "ml-auto max-w-8 opacity-100",
        )}
      >
        {showCollapseButton ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={toggle}
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Collapse sidebar</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}
