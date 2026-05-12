"use client";

import type { ReactionSummary } from "@/features/chat/domain/types";

type Props = {
  reactions: ReactionSummary[];
  currentUserId: string | null;
  onToggle?: (emoji: string) => void;
};

function formatCount(count: number): string {
  if (count >= 100) return "99+";
  return String(count);
}

export function ReactionBar({ reactions, currentUserId, onToggle }: Props) {
  if (reactions.length === 0) return null;

  return (
    <div className="flex max-w-full flex-wrap gap-1 pt-0.5">
      {reactions.map((reaction) => {
        const reactedByMe =
          currentUserId !== null &&
          reaction.reacted_by_ids.includes(currentUserId);
        const canToggle = onToggle !== undefined;

        return (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => onToggle?.(reaction.emoji)}
            disabled={!canToggle}
            className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
              reactedByMe
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-background text-foreground"
            } ${canToggle ? "hover:bg-muted" : "cursor-default opacity-80"}`}
            aria-label={`${reaction.emoji} ${reaction.count}${reactedByMe ? ", reacted" : ""}`}
            aria-pressed={reactedByMe}
          >
            <span>{reaction.emoji}</span>
            <span className="tabular-nums">{formatCount(reaction.count)}</span>
          </button>
        );
      })}
    </div>
  );
}
