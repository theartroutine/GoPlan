"use client";

import { useState, type KeyboardEvent } from "react";

import { Button } from "@/shared/ui/button";
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
        className="min-h-[40px] resize-none"
        aria-label="Message"
      />
      <Button
        type="button"
        size="sm"
        disabled={!canSend}
        onClick={submit}
        aria-label="Send message"
      >
        {isSending ? "…" : "Send"}
      </Button>
    </div>
  );
}
