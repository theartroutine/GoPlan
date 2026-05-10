"use client";

import { CheckCircle2, Circle, CircleDashed, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ChatMessage,
  DeleteChatMessageMode,
} from "@/features/chat/domain/types";
import { ChatAvatar } from "@/features/chat/presentation/chat-avatar";
import { EmojiPicker } from "@/features/chat/presentation/emoji-picker-popover";
import { ReactionBar } from "@/features/chat/presentation/reaction-bar";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

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
  isSelected?: boolean;
  isSelectionMode?: boolean;
  isHovered: boolean;
  isReactionPickerOpen: boolean;
  onRetry?: () => void;
  onHoverStart: (messageId: string) => void;
  onHoverEnd: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onReactionPickerOpenChange: (messageId: string, open: boolean) => void;
  onDeleteMessage?: (messageId: string, mode: DeleteChatMessageMode) => void;
  onToggleSelected?: (messageId: string) => void;
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
const DELETE_FOR_EVERYONE_WINDOW_MS = 5 * 60 * 1000;

function canDeleteForEveryone(message: ChatMessage, isOwn: boolean): boolean {
  if (!isOwn || message.is_deleted_for_everyone) return false;
  const createdAt = Date.parse(message.created_at);
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt <= DELETE_FOR_EVERYONE_WINDOW_MS;
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
  currentUserId,
  isSelected = false,
  isSelectionMode = false,
  isHovered,
  isReactionPickerOpen,
  onRetry,
  onHoverStart,
  onHoverEnd,
  onToggleReaction,
  onReactionPickerOpenChange,
  onDeleteMessage,
  onToggleSelected,
}: Props) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<DeleteChatMessageMode>("for_me");
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const time = formatTime(message.created_at);
  const isDeletedForEveryone = message.is_deleted_for_everyone;
  const canReact =
    !isDeletedForEveryone && !isPending && !isFailed && onToggleReaction !== undefined;
  const canRemove = !isPending && !isFailed && onDeleteMessage !== undefined;
  const canSelect = !isPending && !isFailed && onToggleSelected !== undefined;
  const canRemoveForEveryone = canDeleteForEveryone(message, isOwn);

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

  const handleMouseEnter = () => onHoverStart(message.id);

  // When mouse leaves the message row, hide trigger and close picker.
  // The picker panel is a DOM descendant of this container, so moving the mouse
  // from the bubble to the picker (positioned above) does NOT trigger onMouseLeave.
  const handleMouseLeave = () => {
    onHoverEnd(message.id);
  };

  // Long-press on mobile opens picker directly (no hover available on touch).
  const handleTouchStart = () => {
    if (!canReact) return;
    clearLongPress();
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null;
      onReactionPickerOpenChange(message.id, true);
    }, LONG_PRESS_MS);
  };

  const handleTouchEnd = () => clearLongPress();

  const handleReactionSelect = (emoji: string) => {
    onReactionPickerOpenChange(message.id, false);
    onToggleReaction?.(message.id, emoji);
  };

  const handleReactionPickerOpenChange = (open: boolean) => {
    onReactionPickerOpenChange(message.id, open);
  };

  const openDeleteDialog = () => {
    setDeleteMode("for_me");
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    onDeleteMessage?.(message.id, deleteMode);
    setDeleteDialogOpen(false);
  };

  const actionsVisible = isHovered || deleteDialogOpen;

  const selectTriggerBtn = canSelect ? (
    <button
      type="button"
      onClick={() => onToggleSelected?.(message.id)}
      aria-label="Select message"
      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <CircleDashed size={14} />
    </button>
  ) : null;

  const trashBtn = canRemove ? (
    <button
      type="button"
      onClick={openDeleteDialog}
      aria-label="Remove message"
      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
    >
      <Trash2 size={15} />
    </button>
  ) : null;

  // Hover action controls (hidden in selection mode).
  // Own: [Select][Trash] so reading right-to-left from bubble → Emoji, Trash, Select.
  // Other: [Trash][Select] so reading left-to-right from bubble → Emoji, Trash, Select.
  const actionControlsEl =
    (canRemove || canSelect) && !isSelectionMode && actionsVisible ? (
      <div className="flex shrink-0 items-center gap-0.5">
        {isOwn ? (
          <>
            {selectTriggerBtn}
            {trashBtn}
          </>
        ) : (
          <>
            {trashBtn}
            {selectTriggerBtn}
          </>
        )}
      </div>
    ) : null;

  // Circular checkbox shown at edge of the row in selection mode.
  const edgeCheckboxEl = canSelect && isSelectionMode ? (
    <button
      type="button"
      onClick={() => onToggleSelected?.(message.id)}
      aria-label="Select message"
      aria-pressed={isSelected}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
        isSelected ? "text-primary" : "text-muted-foreground hover:text-foreground"
      } ${isOwn ? "" : "self-center"}`}
    >
      {isSelected ? <CheckCircle2 size={18} /> : <Circle size={18} />}
    </button>
  ) : null;

  const bubbleSurfaceProps = {
    "data-chat-message-hover-surface": "true" as const,
    onMouseEnter: handleMouseEnter,
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
  };

  const bubbleEl = (
    isDeletedForEveryone ? (
      <div
        {...bubbleSurfaceProps}
        className="min-w-0 rounded-2xl border border-dashed border-foreground/60 px-3 py-1.5 text-xs italic text-muted-foreground"
      >
        Bạn đã xóa một tin nhắn
      </div>
    ) : (
      <div
        {...bubbleSurfaceProps}
        className={`min-w-0 rounded-2xl px-3 py-2 text-sm shadow-sm ${
          isOwn
            ? `bg-primary text-primary-foreground${isPending ? " opacity-70" : ""}`
            : "bg-muted text-foreground"
        }`}
      >
        <p className="whitespace-pre-wrap break-all">{message.content}</p>
      </div>
    )
  );

  const emojiPickerEl = canReact && (isHovered || isReactionPickerOpen) ? (
    <EmojiPicker
      showTrigger
      isOwn={isOwn}
      currentUserEmoji={currentUserEmoji}
      open={isReactionPickerOpen}
      onOpenChange={handleReactionPickerOpenChange}
      onSelect={handleReactionSelect}
    />
  ) : null;

  // Hover overlay floats outside the bubble's flex flow so the bubble keeps
  // its full max width when hover icons appear. Inner pr/pl padding bridges
  // the visual gap to the bubble so moving the cursor across it stays within
  // the wrapper (descendant rule of `mouseleave`), preserving hover continuity.
  const hoverOverlayEl =
    actionControlsEl !== null || emojiPickerEl !== null ? (
      <div
        className={`absolute top-0 bottom-0 flex items-center gap-1.5 ${
          isOwn ? "right-full pr-1.5" : "left-full pl-1.5"
        }`}
      >
        {isOwn ? (
          <>
            {actionControlsEl}
            {emojiPickerEl}
          </>
        ) : (
          <>
            {emojiPickerEl}
            {actionControlsEl}
          </>
        )}
      </div>
    ) : null;

  // onMouseLeave on the outer row acts as a safety-net: clears hover state when the
  // cursor exits the row entirely (e.g. fast mouse movement, programmatic scroll).
  const commonRowProps = {
    "data-testid": "chat-message" as const,
    "data-message-id": message.id,
    onMouseLeave: handleMouseLeave,
  };

  // The wrapper owns leave behavior so users can move from the bubble to the
  // revealed icons. Enter behavior lives on the visible bubble surface only;
  // hidden icon slots must not activate hover.
  const bubbleInteractionProps = {
    "data-chat-message-hover-region": message.id,
    "data-chat-message-active":
      isHovered || isReactionPickerOpen ? "true" : undefined,
    onMouseLeave: handleMouseLeave,
  };

  const deleteDialogEl = canRemove ? (
    <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gỡ tin nhắn?</DialogTitle>
          <DialogDescription>
            Chọn cách bạn muốn thu hồi tin nhắn này.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
            <input
              type="radio"
              name={`delete-mode-${message.id}`}
              value="for_me"
              checked={deleteMode === "for_me"}
              onChange={() => setDeleteMode("for_me")}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">Thu hồi với bạn</span>
              <span className="block text-xs text-muted-foreground">
                Chỉ ẩn tin nhắn khỏi khung chat của bạn.
              </span>
            </span>
          </label>
          {canRemoveForEveryone && (
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
              <input
                type="radio"
                name={`delete-mode-${message.id}`}
                value="for_everyone"
                checked={deleteMode === "for_everyone"}
                onChange={() => setDeleteMode("for_everyone")}
                className="mt-1"
              />
              <span>
                <span className="block font-medium">Thu hồi với mọi người</span>
                <span className="block text-xs text-muted-foreground">
                  Nội dung sẽ được thay bằng thông báo đã xóa.
                </span>
              </span>
            </label>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={handleConfirmDelete}>
            Gỡ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  if (isOwn) {
    return (
      <>
        <div
          {...commonRowProps}
          className={`flex w-full items-center justify-end gap-1 ${isGroupContinuation ? "mt-0.5" : "mt-3"}`}
        >
          <div className="flex min-w-0 max-w-[78%] flex-col items-end gap-0.5 sm:max-w-[60%]">
            {/* Hover icons (Select/Trash/Emoji) float in an absolute overlay
                to the LEFT of the own bubble so the bubble keeps its full
                max width when icons appear on hover. */}
            <div {...bubbleInteractionProps} className="relative flex items-center">
              {bubbleEl}
              {hoverOverlayEl}
            </div>
            <ReactionBar
              reactions={isDeletedForEveryone ? [] : message.reactions}
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
          {edgeCheckboxEl}
        </div>
        {deleteDialogEl}
      </>
    );
  }

  // Other-sender layout: avatar gutter on the left, smiley trigger to the RIGHT of bubble.
  return (
    <>
      <div
        {...commonRowProps}
        className={`flex w-full items-end gap-2 ${isGroupContinuation ? "mt-0.5" : "mt-3"}`}
      >
        {edgeCheckboxEl}
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
          {/* Hover icons (Emoji/Trash/Select) float in an absolute overlay
              to the RIGHT of others' bubble so the bubble keeps its full
              max width when icons appear on hover. */}
          <div {...bubbleInteractionProps} className="relative flex items-center">
            {bubbleEl}
            {hoverOverlayEl}
          </div>
          <ReactionBar
            reactions={isDeletedForEveryone ? [] : message.reactions}
            currentUserId={currentUserId}
            onToggle={(emoji) => onToggleReaction?.(message.id, emoji)}
          />
          {showMeta && (
            <span className="px-1 text-[10px] text-muted-foreground">{time}</span>
          )}
        </div>
      </div>
      {deleteDialogEl}
    </>
  );
}
