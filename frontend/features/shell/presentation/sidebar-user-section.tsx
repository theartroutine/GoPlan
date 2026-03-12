"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";

import { useAuth } from "@/features/auth/application/auth-context";
import { useSidebar } from "@/features/shell/application/sidebar-context";
import { getInitials } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

export function SidebarUserSection() {
  const { user } = useAuth();
  const { isCollapsed } = useSidebar();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const identifyTag = user?.identify_tag;
    if (!identifyTag) return;

    try {
      await navigator.clipboard.writeText(identifyTag);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable or permission denied — silently fail
    }
  }, [user?.identify_tag]);

  if (!user) return null;

  const initials = getInitials(user.display_name || user.email);

  const content = (
    <div
      className={cn(
        "flex items-center overflow-hidden transition-[padding,gap] duration-200",
        isCollapsed ? "justify-center gap-0 px-0 py-3" : "gap-3 px-4 py-3",
      )}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-muted text-xs font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "min-w-0 overflow-hidden transition-[opacity,max-width] duration-200",
          isCollapsed ? "max-w-0 opacity-0" : "max-w-48 opacity-100",
        )}
      >
        <p className="truncate text-sm font-medium leading-tight whitespace-nowrap">
          {user.display_name}
        </p>
        {user.identify_tag && (
          <div className="flex items-center gap-1">
            <p className="truncate text-xs text-muted-foreground whitespace-nowrap">
              {user.identify_tag}
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {copied ? "Copied!" : "Copy tag"}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right">
          <p className="font-medium">{user.display_name}</p>
          {user.identify_tag && (
            <p className="text-xs text-muted-foreground">{user.identify_tag}</p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}
