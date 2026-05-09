"use client";

import type { ChatMessage } from "@/features/chat/domain/types";
import { ChatAvatar } from "@/features/chat/presentation/chat-avatar";

type Props = {
  message: ChatMessage;
  isOwn: boolean;
  isPending: boolean;
  isFailed: boolean;
  /** Show sender name above bubble (first message in a group from this sender). */
  showSenderName: boolean;
  /** Show avatar slot (last message in a group from a non-own sender). */
  showAvatar: boolean;
  /** Show timestamp meta line (last in group OR pending/failed states). */
  showMeta: boolean;
  /** Tighten top spacing when this bubble continues a group. */
  isGroupContinuation: boolean;
  onRetry?: () => void;
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function senderLabel(message: ChatMessage): string {
  if (message.sender.display_name) return message.sender.display_name;
  return "Deleted user";
}

export function MessageBubble({
  message,
  isOwn,
  isPending,
  isFailed,
  showSenderName,
  showAvatar,
  showMeta,
  isGroupContinuation,
  onRetry,
}: Props) {
  const time = formatTime(message.created_at);

  if (isOwn) {
    return (
      <div
        className={`flex w-full justify-end ${isGroupContinuation ? "mt-0.5" : "mt-3"}`}
        data-testid="chat-message"
        data-message-id={message.id}
      >
        <div className="flex min-w-0 max-w-[78%] flex-col items-end gap-0.5 sm:max-w-[60%]">
          <div
            className={`min-w-0 rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground shadow-sm ${
              isPending ? "opacity-70" : ""
            }`}
          >
            <p className="whitespace-pre-wrap break-all">{message.content}</p>
          </div>
          {(showMeta || isPending || isFailed) && (
            <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
              {isFailed ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-destructive underline underline-offset-2"
                >
                  Failed — retry
                </button>
              ) : isPending ? (
                <span>Sending…</span>
              ) : (
                <span>{time}</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Other-sender layout: avatar gutter on the left, bubble + optional name + meta.
  return (
    <div
      className={`flex w-full items-end gap-2 ${isGroupContinuation ? "mt-0.5" : "mt-3"}`}
      data-testid="chat-message"
      data-message-id={message.id}
    >
      <div className="w-8 shrink-0">
        {showAvatar && (
          <ChatAvatar
            name={senderLabel(message)}
            seed={message.sender.id ?? message.sender.display_name}
            size="default"
          />
        )}
      </div>
      <div className="flex min-w-0 max-w-[78%] flex-col items-start gap-0.5 sm:max-w-[60%]">
        {showSenderName && (
          <span className="px-1 text-[11px] font-medium text-muted-foreground">
            {senderLabel(message)}
          </span>
        )}
        <div className="min-w-0 rounded-2xl bg-muted px-3 py-2 text-sm text-foreground shadow-sm">
          <p className="whitespace-pre-wrap break-all">{message.content}</p>
        </div>
        {showMeta && (
          <span className="px-1 text-[10px] text-muted-foreground">{time}</span>
        )}
      </div>
    </div>
  );
}
