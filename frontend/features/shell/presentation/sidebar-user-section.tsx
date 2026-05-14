"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";

import { useAuth } from "@/features/auth/application/auth-context";
import { useSidebar } from "@/features/shell/application/sidebar-context";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { UserAvatar } from "@/shared/ui/user-avatar";
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

  const copyButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy tag"}
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
  );

  const expandedContent = (
    <div
      className={cn(
        "flex items-center gap-3 overflow-hidden px-4 py-3",
      )}
    >
      <UserAvatar user={user} size="default" className="shrink-0" />
      <div
        className={cn(
          "min-w-0 overflow-hidden transition-[opacity,transform] duration-300 ease-out",
          isCollapsed ? "translate-x-1 opacity-0" : "translate-x-0 opacity-100",
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
            {copyButton}
          </div>
        )}
      </div>
    </div>
  );

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-2 py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <UserAvatar user={user} size="default" className="shrink-0" />
          </TooltipTrigger>
          <TooltipContent side="right">
            <p className="font-medium">{user.display_name}</p>
            {user.identify_tag && (
              <p className="text-xs text-muted-foreground">{user.identify_tag}</p>
            )}
          </TooltipContent>
        </Tooltip>
        {user.identify_tag ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy tag"}
          >
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        ) : null}
      </div>
    );
  }

  return expandedContent;
}
