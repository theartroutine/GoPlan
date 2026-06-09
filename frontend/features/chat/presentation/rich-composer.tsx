"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

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
const EMPTY_AI_PROMPT_MESSAGE = "What would you like to ask GoPlanAI?";

type ComposerSendResult = void | "ok" | "duplicate" | "failed" | "blocked";

type Props = {
  disabled: boolean;
  isSending: boolean;
  placeholder?: string;
  onSend: (content: string) => ComposerSendResult | Promise<ComposerSendResult>;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldRestoreFocusRef = useRef(false);
  const [hasMention, setHasMention] = useState(false);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localSending, setLocalSending] = useState(false);

  const normalizedDraft = normalizePlainText(draft);
  const sending = isSending || localSending;
  const canSubmit =
    !disabled && !sending && (hasMention || normalizedDraft.length > 0);

  const restoreEditorFocus = useCallback((): void => {
    const focusEditor = () => {
      const textarea = textareaRef.current;
      if (!textarea || disabled || textarea.disabled) return;
      textarea.focus({ preventScroll: true });
    };

    window.requestAnimationFrame(() => {
      focusEditor();
      window.setTimeout(focusEditor, 0);
    });
  }, [disabled]);

  useEffect(() => {
    if (sending || !shouldRestoreFocusRef.current) return;

    shouldRestoreFocusRef.current = false;
    if (!disabled) {
      restoreEditorFocus();
    }
  }, [disabled, restoreEditorFocus, sending]);

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

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    if (hasMention && normalizedDraft.length === 0) {
      setError(EMPTY_AI_PROMPT_MESSAGE);
      return;
    }

    const submittedHasMention = hasMention;
    const submittedDraft = draft;
    const content = hasMention
      ? `${GOPLAN_AI_MENTION} ${limitDraftForMode(normalizedDraft, true)}`.trim()
      : normalizedDraft;

    setLocalSending(true);
    shouldRestoreFocusRef.current = true;
    setMenuOpen(false);
    setError(null);
    try {
      const result = await onSend(content);
      if (result === "blocked") {
        setHasMention(submittedHasMention);
        setDraft(submittedDraft);
        return;
      }
      setHasMention(false);
      setDraft("");
    } finally {
      setLocalSending(false);
    }
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
      void submit();
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
            ref={textareaRef}
            value={draft}
            rows={1}
            maxLength={hasMention ? MAX_AI_PROMPT_LENGTH : MAX_CONTENT_LENGTH}
            placeholder={
              placeholder ?? (hasMention ? "Ask GoPlanAI" : "Write a message")
            }
            disabled={disabled || sending}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className="min-h-6 min-w-0 flex-1 resize-none border-0 bg-transparent p-0 leading-6 shadow-none focus-visible:ring-0"
            aria-label="Message"
          />
        </div>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground transition-all hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
          aria-label="Send message"
          aria-busy={sending}
        >
          {sending ? (
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
