import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/features/chat/domain/types";
import { MessageList } from "@/features/chat/presentation/message-list";

const CURRENT_USER_ID = "user-self";

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m-1",
    trip_id: "trip-1",
    sender: { id: CURRENT_USER_ID, display_name: "Me", identify_tag: null },
    content: "hello",
    client_message_id: null,
    created_at: "2026-05-08T10:00:00Z",
    is_deleted_for_everyone: false,
    deleted_for_everyone_at: null,
    deleted_for_everyone_by_id: null,
    reactions: [],
    ...overrides,
  };
}

function getInteractionForMessage(content: string): HTMLElement {
  const textEl = screen.getByText((_, element) => {
    return element?.tagName.toLowerCase() === "p" && element.textContent === content;
  });
  const bubbleEl = textEl.parentElement;
  const interactionEl = bubbleEl?.parentElement;
  if (!(interactionEl instanceof HTMLElement)) {
    throw new Error(`Could not find interaction wrapper for "${content}".`);
  }
  return interactionEl;
}

function getReactionTriggers(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Add reaction"]',
    ),
  );
}

describe("MessageList", () => {
  it("offers a manual older-message load when older pages exist", () => {
    const onLoadOlder = vi.fn();

    render(
      <MessageList
        messages={[makeMessage()]}
        currentUserId={CURRENT_USER_ID}
        pendingClientIds={new Set()}
        failedClientIds={new Set()}
        hasMoreOlder
        isLoadingOlder={false}
        onLoadOlder={onLoadOlder}
        onRetry={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load earlier" }));

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it("opens remove dialog with both modes for an own recent message", () => {
    const onDeleteMessage = vi.fn();

    render(
      <MessageList
        messages={[makeMessage({ created_at: new Date().toISOString() })]}
        currentUserId={CURRENT_USER_ID}
        pendingClientIds={new Set()}
        failedClientIds={new Set()}
        hasMoreOlder={false}
        isLoadingOlder={false}
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
        onDeleteMessage={onDeleteMessage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove message" }));
    fireEvent.click(screen.getByLabelText(/Thu hồi với mọi người/));
    fireEvent.click(screen.getByRole("button", { name: "Gỡ" }));

    expect(onDeleteMessage).toHaveBeenCalledWith("m-1", "for_everyone");
  });

  it("bulk selection only offers remove for current user", () => {
    const onHideMessagesForMe = vi.fn();

    render(
      <MessageList
        messages={[
          makeMessage({ id: "m-1", content: "one" }),
          makeMessage({ id: "m-2", content: "two" }),
        ]}
        currentUserId={CURRENT_USER_ID}
        pendingClientIds={new Set()}
        failedClientIds={new Set()}
        hasMoreOlder={false}
        isLoadingOlder={false}
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
        onHideMessagesForMe={onHideMessagesForMe}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Select message" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Select message" })[1]);

    expect(screen.getByText("2 selected")).not.toBeNull();
    expect(screen.queryByText("Thu hồi với mọi người")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thu hồi với bạn" }));

    expect(onHideMessagesForMe).toHaveBeenCalledWith(["m-1", "m-2"]);
  });

  it("keeps hover controls active for only the latest hovered message", () => {
    render(
      <MessageList
        messages={[
          makeMessage({ id: "m-1", content: "one" }),
          makeMessage({ id: "m-2", content: "two" }),
        ]}
        currentUserId={CURRENT_USER_ID}
        pendingClientIds={new Set()}
        failedClientIds={new Set()}
        hasMoreOlder={false}
        isLoadingOlder={false}
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
        onToggleReaction={vi.fn()}
      />,
    );

    const [firstReactionTrigger, secondReactionTrigger] = getReactionTriggers();

    fireEvent.mouseEnter(getInteractionForMessage("one"));
    expect(firstReactionTrigger.getAttribute("aria-hidden")).toBeNull();
    expect(secondReactionTrigger.getAttribute("aria-hidden")).toBe("true");

    fireEvent.mouseEnter(getInteractionForMessage("two"));

    expect(firstReactionTrigger.getAttribute("aria-hidden")).toBe("true");
    expect(secondReactionTrigger.getAttribute("aria-hidden")).toBeNull();
  });

  it("hides hover controls when the pointer leaves the active message", () => {
    render(
      <MessageList
        messages={[makeMessage({ id: "m-1", content: "one" })]}
        currentUserId={CURRENT_USER_ID}
        pendingClientIds={new Set()}
        failedClientIds={new Set()}
        hasMoreOlder={false}
        isLoadingOlder={false}
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
        onToggleReaction={vi.fn()}
      />,
    );

    const [reactionTrigger] = getReactionTriggers();
    const interactionEl = getInteractionForMessage("one");

    fireEvent.mouseEnter(interactionEl);
    expect(reactionTrigger.getAttribute("aria-hidden")).toBeNull();

    fireEvent.mouseLeave(interactionEl);

    expect(reactionTrigger.getAttribute("aria-hidden")).toBe("true");
  });

  it("closes an open reaction picker when another message becomes active", () => {
    render(
      <MessageList
        messages={[
          makeMessage({ id: "m-1", content: "one" }),
          makeMessage({ id: "m-2", content: "two" }),
        ]}
        currentUserId={CURRENT_USER_ID}
        pendingClientIds={new Set()}
        failedClientIds={new Set()}
        hasMoreOlder={false}
        isLoadingOlder={false}
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
        onToggleReaction={vi.fn()}
      />,
    );

    fireEvent.mouseEnter(getInteractionForMessage("one"));
    fireEvent.click(getReactionTriggers()[0]);
    expect(screen.getByRole("dialog", { name: "Pick a reaction" })).not.toBeNull();

    fireEvent.mouseEnter(getInteractionForMessage("two"));

    expect(screen.queryByRole("dialog", { name: "Pick a reaction" })).toBeNull();
  });

  it("centers hover controls beside multiline message bubbles", () => {
    const ownContent = "one\ntwo\nthree";
    const otherContent = "alpha\nbeta\ngamma";

    render(
      <MessageList
        messages={[
          makeMessage({ id: "m-1", content: ownContent }),
          makeMessage({
            id: "m-2",
            sender: { id: "user-other", display_name: "Other", identify_tag: null },
            content: otherContent,
          }),
        ]}
        currentUserId={CURRENT_USER_ID}
        pendingClientIds={new Set()}
        failedClientIds={new Set()}
        hasMoreOlder={false}
        isLoadingOlder={false}
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
        onToggleReaction={vi.fn()}
      />,
    );

    expect(getInteractionForMessage(ownContent).classList.contains("items-center"))
      .toBe(true);
    expect(getInteractionForMessage(otherContent).classList.contains("items-center"))
      .toBe(true);
  });
});
