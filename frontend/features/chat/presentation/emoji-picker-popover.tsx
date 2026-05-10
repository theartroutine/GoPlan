"use client";

import { useEffect, useRef, useState } from "react";

import { ALLOWED_REACTION_EMOJIS } from "@/features/chat/domain/types";

type Props = {
  /** Where to anchor the picker: left (for own messages) or right (for others). */
  align: "left" | "right";
  onSelect: (emoji: string) => void;
};

const LONG_PRESS_MS = 400;

type TriggerProps = {
  children: React.ReactNode;
  onActivate: () => void;
};

function LongPressTrigger({ children, onActivate }: TriggerProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Clear on unmount to prevent stale callbacks.
  useEffect(() => clearTimer, []);

  const start = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onActivate();
    }, LONG_PRESS_MS);
  };

  return (
    <div
      onMouseEnter={onActivate}
      onTouchStart={start}
      onTouchEnd={clearTimer}
      onTouchMove={clearTimer}
      onTouchCancel={clearTimer}
      className="group relative"
    >
      {children}
    </div>
  );
}

type EmojiPickerPopoverProps = Props & {
  children: React.ReactNode;
};

export function EmojiPickerPopover({
  align,
  onSelect,
  children,
}: EmojiPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  const handleSelect = (emoji: string) => {
    setOpen(false);
    onSelect(emoji);
  };

  return (
    <div ref={containerRef} className="relative">
      <LongPressTrigger onActivate={() => setOpen(true)}>
        {children}
      </LongPressTrigger>

      {open && (
        <div
          role="dialog"
          aria-label="Add reaction"
          className={`absolute bottom-full z-10 mb-1 flex gap-0.5 rounded-full border border-border bg-popover p-1 shadow-md ${
            align === "right" ? "left-0" : "right-0"
          }`}
          onMouseLeave={() => setOpen(false)}
        >
          {ALLOWED_REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleSelect(emoji)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
