"use client";

import type { ReactionSummary } from "@/features/chat/domain/types";

type Props = {
  reactions: ReactionSummary[];
  currentUserId: string | null;
  onToggle: (emoji: string) => void;
};

export function ReactionBar({ reactions, currentUserId, onToggle }: Props) {
  if (reactions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {reactions.map((reaction) => {
        const reactedByMe =
          currentUserId !== null &&
          reaction.reacted_by_ids.includes(currentUserId);

        return (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => onToggle(reaction.emoji)}
            className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
              reactedByMe
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-background text-foreground hover:bg-muted"
            }`}
            aria-label={`${reaction.emoji} ${reaction.count}${reactedByMe ? ", reacted" : ""}`}
          >
            <span>{reaction.emoji}</span>
            <span className="tabular-nums">{reaction.count}</span>
          </button>
        );
      })}
    </div>
  );
}
