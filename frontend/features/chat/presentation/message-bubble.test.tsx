import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/features/chat/domain/types";
import { MessageBubble } from "@/features/chat/presentation/message-bubble";

vi.mock("highlight.js", () => ({
  default: {
    highlight: vi.fn((code: string) => ({ value: code })),
  },
}));

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m-1",
    trip_id: "trip-1",
    sender: { id: "user-1", display_name: "Alice", identify_tag: null },
    sender_kind: "USER",
    ai_status: null,
    content: "hello",
    client_message_id: null,
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    is_deleted_for_everyone: false,
    deleted_for_everyone_at: null,
    deleted_for_everyone_by_id: null,
    delete_for_everyone_until: null,
    can_delete_for_everyone: false,
    reactions: [],
    action_drafts: [],
    ...overrides,
  };
}

const baseProps = {
  isOwn: false,
  isPending: false,
  isFailed: false,
  isCaptainSender: false,
  showSenderName: true,
  showAvatar: true,
  showMeta: true,
  isGroupContinuation: false,
  currentUserId: "user-self",
  isHovered: false,
  isReactionPickerOpen: false,
  onHoverStart: () => {},
  onHoverEnd: () => {},
  onReactionPickerOpenChange: () => {},
};

describe("MessageBubble — sender_kind routing", () => {
  it("renders AI message with markdown — **text** becomes <strong>", () => {
    const msg = makeMessage({ sender_kind: "AI", content: "**bold**" });
    render(<MessageBubble {...baseProps} message={msg} />);
    expect(document.querySelector("strong")).toBeTruthy();
    expect(document.body.textContent).not.toContain("**bold**");
  });

  it("suppresses headings in AI messages — no <h2> rendered", () => {
    const msg = makeMessage({ sender_kind: "AI", content: "## Title" });
    render(<MessageBubble {...baseProps} message={msg} />);
    expect(document.querySelector("h2")).toBeNull();
  });

  it("renders user message as plain text — markdown syntax not processed", () => {
    const msg = makeMessage({ sender_kind: "USER", content: "**not bold**" });
    render(<MessageBubble {...baseProps} message={msg} />);
    expect(document.querySelector("strong")).toBeNull();
    expect(screen.getByText("**not bold**")).toBeInTheDocument();
  });
});
