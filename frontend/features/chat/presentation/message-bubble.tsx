"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatMessage } from "@/features/chat/domain/types";
import { ChatAvatar } from "@/features/chat/presentation/chat-avatar";
import { EmojiPicker } from "@/features/chat/presentation/emoji-picker-popover";
import { ReactionBar } from "@/features/chat/presentation/reaction-bar";

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
  currentUserId: string | null;
  onRetry?: () => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
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

const LONG_PRESS_MS = 400;

export function MessageBubble({
  message,
  isOwn,
  isPending,
  isFailed,
  showSenderName,
  showAvatar,
  showMeta,
  isGroupContinuation,
  currentUserId,
  onRetry,
  onToggleReaction,
}: Props) {
  const [isHovered, setIsHovered] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const time = formatTime(message.created_at);
  const canReact = !isPending && !isFailed && onToggleReaction !== undefined;

  // Find the emoji the current user has already reacted with (if any).
  const currentUserEmoji: string | null =
    currentUserId !== null
      ? (message.reactions.find((r) =>
          r.reacted_by_ids.includes(currentUserId),
        )?.emoji ?? null)
      : null;

  const clearLongPress = useCallback(() => {
    if (longPressRef.current !== null) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  const handleMouseEnter = () => setIsHovered(true);

  // When mouse leaves the message row, hide trigger and close picker.
  // The picker panel is a DOM descendant of this container, so moving the mouse
  // from the bubble to the picker (positioned above) does NOT trigger onMouseLeave.
  const handleMouseLeave = () => {
    setIsHovered(false);
    setPickerOpen(false);
  };

  // Long-press on mobile opens picker directly (no hover available on touch).
  const handleTouchStart = () => {
    if (!canReact) return;
    clearLongPress();
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null;
      setPickerOpen(true);
    }, LONG_PRESS_MS);
  };

  const handleTouchEnd = () => clearLongPress();

  const handleReactionSelect = (emoji: string) => {
    setPickerOpen(false);
    onToggleReaction?.(message.id, emoji);
  };

  const bubbleEl = (
    <div
      className={`min-w-0 rounded-2xl px-3 py-2 text-sm shadow-sm ${
        isOwn
          ? `bg-primary text-primary-foreground${isPending ? " opacity-70" : ""}`
          : "bg-muted text-foreground"
      }`}
    >
      <p className="whitespace-pre-wrap break-all">{message.content}</p>
    </div>
  );

  const emojiPickerEl = canReact ? (
    <EmojiPicker
      showTrigger={isHovered}
      isOwn={isOwn}
      currentUserEmoji={currentUserEmoji}
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      onSelect={handleReactionSelect}
    />
  ) : null;

  const commonRowProps = {
    "data-testid": "chat-message" as const,
    "data-message-id": message.id,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
  };

  if (isOwn) {
    return (
      <div
        {...commonRowProps}
        className={`flex w-full justify-end ${isGroupContinuation ? "mt-0.5" : "mt-3"}`}
      >
        <div className="flex min-w-0 max-w-[78%] flex-col items-end gap-0.5 sm:max-w-[60%]">
          {/* Smiley trigger sits to the LEFT of the own bubble */}
          <div className="flex items-end gap-1.5">
            {emojiPickerEl}
            {bubbleEl}
          </div>
          <ReactionBar
            reactions={message.reactions}
            currentUserId={currentUserId}
            onToggle={(emoji) => onToggleReaction?.(message.id, emoji)}
          />
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

  // Other-sender layout: avatar gutter on the left, smiley trigger to the RIGHT of bubble.
  return (
    <div
      {...commonRowProps}
      className={`flex w-full items-end gap-2 ${isGroupContinuation ? "mt-0.5" : "mt-3"}`}
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
        {/* Smiley trigger sits to the RIGHT of others' bubble */}
        <div className="flex items-end gap-1.5">
          {bubbleEl}
          {emojiPickerEl}
        </div>
        <ReactionBar
          reactions={message.reactions}
          currentUserId={currentUserId}
          onToggle={(emoji) => onToggleReaction?.(message.id, emoji)}
        />
        {showMeta && (
          <span className="px-1 text-[10px] text-muted-foreground">{time}</span>
        )}
      </div>
    </div>
  );
}
