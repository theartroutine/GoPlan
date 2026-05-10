"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import type { ChatMessage } from "@/features/chat/domain/types";
import { MessageBubble } from "@/features/chat/presentation/message-bubble";
import { Spinner } from "@/shared/ui/spinner";

type Props = {
  messages: ChatMessage[];
  currentUserId: string;
  pendingClientIds: Set<string>;
  failedClientIds: Set<string>;
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  onLoadOlder: () => void;
  onRetry: (clientMessageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
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
  pendingClientIds,
  failedClientIds,
  hasMoreOlder,
  isLoadingOlder,
  onLoadOlder,
  onRetry,
  onToggleReaction,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
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
              showSenderName={!continuesPrev && !isOwn}
              showAvatar={!continuesNext && !isOwn}
              showMeta={!continuesNext}
              isGroupContinuation={continuesPrev}
              currentUserId={currentUserId}
              onRetry={cid ? () => onRetry(cid) : undefined}
              onToggleReaction={onToggleReaction}
            />
          );
        })
      )}
    </div>
  );
}
