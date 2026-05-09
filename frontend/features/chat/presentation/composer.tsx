"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { Textarea } from "@/shared/ui/textarea";

const MAX_CONTENT_LENGTH = 2000;

type Props = {
  disabled: boolean;
  isSending: boolean;
  placeholder?: string;
  onSend: (content: string) => void;
};

export function Composer({ disabled, isSending, placeholder, onSend }: Props) {
  const [value, setValue] = useState("");

  const trimmed = value.trim();
  const canSend = !disabled && !isSending && trimmed.length > 0;

  function submit() {
    if (!canSend) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-border bg-background px-3 py-2">
      <Textarea
        value={value}
        rows={1}
        maxLength={MAX_CONTENT_LENGTH}
        placeholder={placeholder ?? "Write a message"}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="min-h-[40px] min-w-0 flex-1 resize-none"
        aria-label="Message"
      />
      <button
        type="button"
        disabled={!canSend}
        onClick={submit}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground transition-all hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
        aria-label="Send message"
        aria-busy={isSending}
      >
        {isSending ? (
          <Loader2 className="size-4 animate-spin text-background" aria-hidden="true" />
        ) : (
          <ArrowUp className="size-4 stroke-[2.5] text-background" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
