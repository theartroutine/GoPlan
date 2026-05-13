"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useState, type ChangeEvent, type KeyboardEvent } from "react";

import {
  GOPLAN_AI_MENTION,
  parseGoPlanAIMention,
} from "@/features/chat/domain/ai-mention";
import { AIMentionToken } from "@/features/chat/presentation/ai-mention-token";
import { MentionCommandMenu } from "@/features/chat/presentation/mention-command-menu";
import { Textarea } from "@/shared/ui/textarea";

const MAX_CONTENT_LENGTH = 2000;
const AI_MESSAGE_PREFIX = `${GOPLAN_AI_MENTION} `;
const MAX_AI_PROMPT_LENGTH = MAX_CONTENT_LENGTH - AI_MESSAGE_PREFIX.length;
const EMPTY_AI_PROMPT_MESSAGE = "Bạn muốn hỏi GoPlanAI điều gì?";

type Props = {
  disabled: boolean;
  isSending: boolean;
  placeholder?: string;
  onSend: (content: string) => void;
};

function normalizePlainText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function removeTrailingCommandTrigger(value: string): string {
  return value.replace(/@\s*$/, "").trim();
}

function limitDraftForMode(value: string, hasAIMention: boolean): string {
  return value.slice(
    0,
    hasAIMention ? MAX_AI_PROMPT_LENGTH : MAX_CONTENT_LENGTH,
  );
}

export function RichComposer({ disabled, isSending, placeholder, onSend }: Props) {
  const [hasMention, setHasMention] = useState(false);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedDraft = normalizePlainText(draft);
  const canSubmit =
    !disabled && !isSending && (hasMention || normalizedDraft.length > 0);

  function applyInput(rawValue: string): void {
    const parsed = parseGoPlanAIMention(rawValue);
    setError(null);

    if (parsed.hasMention) {
      setHasMention(true);
      setDraft(limitDraftForMode(parsed.prompt, true));
      setMenuOpen(false);
      return;
    }

    setDraft(limitDraftForMode(rawValue, false));
    if (!hasMention) {
      setMenuOpen(/(^|\s)@$/.test(rawValue));
    }
  }

  function selectGoPlanAI(): void {
    setHasMention(true);
    setDraft(limitDraftForMode(removeTrailingCommandTrigger(draft), true));
    setMenuOpen(false);
    setError(null);
  }

  function submit(): void {
    if (!canSubmit) return;
    if (hasMention && normalizedDraft.length === 0) {
      setError(EMPTY_AI_PROMPT_MESSAGE);
      return;
    }

    const content = hasMention
      ? `${GOPLAN_AI_MENTION} ${limitDraftForMode(normalizedDraft, true)}`.trim()
      : normalizedDraft;

    onSend(content);
    setHasMention(false);
    setDraft("");
    setMenuOpen(false);
    setError(null);
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    applyInput(event.target.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (hasMention && draft.length === 0 && event.key === "Backspace") {
      event.preventDefault();
      setHasMention(false);
      setError(null);
      return;
    }

    if (menuOpen && event.key === "Enter") {
      event.preventDefault();
      selectGoPlanAI();
      return;
    }

    if (menuOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      return;
    }

    if (menuOpen && event.key === "Escape") {
      event.preventDefault();
      setMenuOpen(false);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="relative border-t border-border bg-background px-3 py-2">
      <MentionCommandMenu
        open={menuOpen}
        activeIndex={0}
        onSelect={selectGoPlanAI}
      />
      <div className="flex items-end gap-2">
        <div className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
          {hasMention && <AIMentionToken />}
          <Textarea
            value={draft}
            rows={1}
            maxLength={hasMention ? MAX_AI_PROMPT_LENGTH : MAX_CONTENT_LENGTH}
            placeholder={
              placeholder ?? (hasMention ? "Ask GoPlanAI" : "Write a message")
            }
            disabled={disabled}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className="min-h-6 min-w-0 flex-1 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            aria-label="Message"
          />
        </div>
        <button
          type="button"
          disabled={!canSubmit}
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
      {error && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
