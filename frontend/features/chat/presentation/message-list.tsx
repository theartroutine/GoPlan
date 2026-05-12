"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import type {
  ChatMessage,
  DeleteChatMessageMode,
} from "@/features/chat/domain/types";
import { AITypingIndicator } from "@/features/chat/presentation/ai-typing-indicator";
import { MessageBubble } from "@/features/chat/presentation/message-bubble";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

type Props = {
  messages: ChatMessage[];
  currentUserId: string;
  captainUserId?: string | null;
  pendingClientIds: Set<string>;
  failedClientIds: Set<string>;
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  onLoadOlder: () => void;
  onRetry: (clientMessageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onDeleteMessage?: (messageId: string, mode: DeleteChatMessageMode) => void;
  onHideMessagesForMe?: (messageIds: string[]) => void;
  isAITyping?: boolean;
};

const SCROLL_STICK_THRESHOLD_PX = 80;
const SCROLL_LOAD_TRIGGER_PX = 200;
const GROUP_GAP_MS = 5 * 60 * 1000;

function senderKey(m: ChatMessage): string {
  return m.sender.id ?? `name:${m.sender.display_name}`;
}

function sameGroup(a: ChatMessage, b: ChatMessage): boolean {
  if (senderKey(a) !== senderKey(b)) return false;
  const tA = Date.parse(a.created_at);
  const tB = Date.parse(b.created_at);
  if (Number.isNaN(tA) || Number.isNaN(tB)) return true;
  return Math.abs(tB - tA) <= GROUP_GAP_MS;
}

export function MessageList({
  messages,
  currentUserId,
  captainUserId = null,
  pendingClientIds,
  failedClientIds,
  hasMoreOlder,
  isLoadingOlder,
  onLoadOlder,
  onRetry,
  onToggleReaction,
  onDeleteMessage,
  onHideMessagesForMe,
  isAITyping = false,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [openReactionPickerMessageId, setOpenReactionPickerMessageId] =
    useState<string | null>(null);
  const wasNearBottomRef = useRef(true);
  const lastMessageIdRef = useRef<string | null>(null);
  const firstMessageIdRef = useRef<string | null>(null);
  // Captured before kicking off `onLoadOlder` so we can anchor scroll position
  // after the new (older) page is prepended — prevents the user from being
  // jerked back to the top.
  const prevScrollHeightRef = useRef<number | null>(null);
  // Only auto-load older when the user has actually interacted with the
  // scroller. Keeps the initial render (which can have scrollTop ≈ 0 if there
  // are few messages) from triggering a load immediately on mount.
  const userInteractedRef = useRef(false);
  const isSelectionMode = selectedIds.size > 0;

  const activateMessage = useCallback((messageId: string) => {
    setActiveMessageId(messageId);
    setOpenReactionPickerMessageId((current) =>
      current === null || current === messageId ? current : null,
    );
  }, []);

  const deactivateMessage = useCallback((messageId: string) => {
    setActiveMessageId((current) => (current === messageId ? null : current));
    setOpenReactionPickerMessageId((current) =>
      current === messageId ? null : current,
    );
  }, []);

  const clearActiveMessage = useCallback(() => {
    setActiveMessageId(null);
    setOpenReactionPickerMessageId(null);
  }, []);

  const clearActiveMessageFromBlankSpace = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        clearActiveMessage();
        return;
      }

      if (target.closest("[data-chat-message-hover-surface]") !== null) {
        return;
      }

      if (target.closest('[data-chat-message-active="true"]') !== null) {
        return;
      }

      clearActiveMessage();
    },
    [clearActiveMessage],
  );

  const setReactionPickerOpen = useCallback(
    (messageId: string, open: boolean) => {
      if (open) {
        setActiveMessageId(messageId);
        setOpenReactionPickerMessageId(messageId);
        return;
      }

      setOpenReactionPickerMessageId((current) =>
        current === messageId ? null : current,
      );
    },
    [],
  );

  const toggleSelected = (messageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const hideSelectedForMe = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    onHideMessagesForMe?.(ids);
    clearSelection();
  };

  // Mark scroller as user-interacted on real input gestures.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const mark = () => {
      userInteractedRef.current = true;
    };
    el.addEventListener("wheel", mark, { passive: true });
    el.addEventListener("touchmove", mark, { passive: true });
    el.addEventListener("keydown", mark);
    return () => {
      el.removeEventListener("wheel", mark);
      el.removeEventListener("touchmove", mark);
      el.removeEventListener("keydown", mark);
    };
  }, []);

  // Scroll handler: track stickiness AND trigger auto-load near top.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const handler = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      wasNearBottomRef.current = distanceFromBottom < SCROLL_STICK_THRESHOLD_PX;

      if (
        userInteractedRef.current &&
        hasMoreOlder &&
        !isLoadingOlder &&
        prevScrollHeightRef.current === null &&
        el.scrollTop < SCROLL_LOAD_TRIGGER_PX
      ) {
        prevScrollHeightRef.current = el.scrollHeight;
        onLoadOlder();
      }
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [hasMoreOlder, isLoadingOlder, onLoadOlder]);

  // Auto-scroll to bottom when a new message arrives if user is near bottom.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    const lastId = last?.id ?? null;
    const isNewMessage = lastId !== lastMessageIdRef.current;
    lastMessageIdRef.current = lastId;
    if (isNewMessage && wasNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Auto-scroll to bottom when the AI typing indicator appears so the user
  // can see it — the indicator is not a message so the effect above won't fire.
  useEffect(() => {
    if (!isAITyping) return;
    const el = scrollerRef.current;
    if (!el || !wasNearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [isAITyping]);

  // After older messages are prepended, anchor scroll position so the user's
  // current view doesn't jump.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const first = messages[0];
    const firstId = first?.id ?? null;
    const prevFirstId = firstMessageIdRef.current;
    if (
      prevFirstId !== null &&
      firstId !== prevFirstId &&
      prevScrollHeightRef.current !== null
    ) {
      const delta = el.scrollHeight - prevScrollHeightRef.current;
      if (delta > 0) {
        el.scrollTop = el.scrollTop + delta;
      }
    }
    firstMessageIdRef.current = firstId;
    // Always reset so a stalled load (e.g. empty page) doesn't block future
    // anchoring once another load fires.
    prevScrollHeightRef.current = null;
  }, [messages]);

  return (
    <div
      ref={scrollerRef}
      onMouseMove={clearActiveMessageFromBlankSpace}
      onMouseLeave={clearActiveMessage}
      className="flex flex-1 min-h-0 flex-col overflow-y-auto px-3 py-3 sm:px-4"
    >
      {hasMoreOlder && (
        <div className="flex justify-center py-1.5">
          {isLoadingOlder ? (
            <Spinner />
          ) : (
            <button
              type="button"
              onClick={onLoadOlder}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Load earlier
            </button>
          )}
        </div>
      )}
      {isSelectionMode && (
        <div className="sticky top-0 z-10 mb-2 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-1 py-2 backdrop-blur">
          <span className="text-xs font-medium text-foreground">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearSelection}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={hideSelectedForMe}
              disabled={!onHideMessagesForMe}
            >
              Thu hồi với bạn
            </Button>
          </div>
        </div>
      )}
      {messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-12 text-center text-sm text-muted-foreground">
          No messages yet. Say hello to your trip mates.
        </div>
      ) : (
        messages.map((message, idx) => {
          const cid = message.client_message_id;
          const isPending = cid !== null && pendingClientIds.has(cid);
          const isFailed = cid !== null && failedClientIds.has(cid);
          const isOwn = message.sender.id === currentUserId;
          const isCaptainSender =
            message.sender.id !== null && message.sender.id === captainUserId;
          const prev = idx > 0 ? messages[idx - 1] : null;
          const next =
            idx < messages.length - 1 ? messages[idx + 1] : null;
          const continuesPrev = prev !== null && sameGroup(prev, message);
          const continuesNext = next !== null && sameGroup(message, next);
          return (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={isOwn}
              isPending={isPending}
              isFailed={isFailed}
              isCaptainSender={isCaptainSender}
              showSenderName={!continuesPrev && !isOwn}
              showAvatar={!continuesNext && !isOwn}
              showMeta={!continuesNext}
              isGroupContinuation={continuesPrev}
              currentUserId={currentUserId}
              isSelected={selectedIds.has(message.id)}
              isSelectionMode={isSelectionMode}
              isHovered={activeMessageId === message.id}
              isReactionPickerOpen={openReactionPickerMessageId === message.id}
              onRetry={cid ? () => onRetry(cid) : undefined}
              onHoverStart={activateMessage}
              onHoverEnd={deactivateMessage}
              onToggleReaction={onToggleReaction}
              onReactionPickerOpenChange={setReactionPickerOpen}
              onDeleteMessage={onDeleteMessage}
              onToggleSelected={onHideMessagesForMe ? toggleSelected : undefined}
            />
          );
        })
      )}
      {isAITyping && <AITypingIndicator />}
    </div>
  );
}
