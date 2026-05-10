"use client";

import { SmilePlus } from "lucide-react";
import { useEffect, useRef } from "react";

import { ALLOWED_REACTION_EMOJIS } from "@/features/chat/domain/types";

type Props = {
  /** Show/hide the smiley trigger button (driven by parent hover state). */
  showTrigger: boolean;
  /** Positions the picker panel: right-0 for own messages, left-0 for others. */
  isOwn: boolean;
  /** The emoji this user has already reacted with on this message, if any. */
  currentUserEmoji: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (emoji: string) => void;
};

export function EmojiPicker({
  showTrigger,
  isOwn,
  currentUserEmoji,
  open,
  onOpenChange,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Outside click/touch closes the picker.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open, onOpenChange]);

  const handleSelect = (emoji: string) => {
    onOpenChange(false);
    onSelect(emoji);
  };

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      {/* Trigger button: always present for layout stability; hidden via opacity when inactive. */}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label="Add reaction"
        aria-expanded={open}
        aria-hidden={showTrigger || open ? undefined : true}
        tabIndex={showTrigger || open ? 0 : -1}
        className={`flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150 ${
          showTrigger || open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        } ${
          open
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <SmilePlus size={15} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pick a reaction"
          className={`absolute bottom-full z-50 flex gap-0.5 rounded-full border border-border bg-popover p-1 shadow-md animate-in fade-in zoom-in-95 duration-100 ${
            isOwn ? "right-0" : "left-0"
          }`}
        >
          {ALLOWED_REACTION_EMOJIS.map((emoji) => {
            const isActive = emoji === currentUserEmoji;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelect(emoji)}
                aria-label={emoji}
                aria-pressed={isActive}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive ? "bg-primary/10 ring-1 ring-primary/40" : ""
                }`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
