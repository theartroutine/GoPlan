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
    reactions: [],
    ...overrides,
  };
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
});
