"use client";

import { Spinner } from "@/shared/ui/spinner";

import { useTripChat } from "@/features/chat/application/use-trip-chat";
import { ConnectionBanner } from "@/features/chat/presentation/connection-banner";
import { Composer } from "@/features/chat/presentation/composer";
import { MessageList } from "@/features/chat/presentation/message-list";
import { useWebSocket } from "@/features/realtime/application/ws-context";

type Props = {
  tripId: string;
  isTerminal: boolean;
  currentUser: {
    id: string;
    display_name: string;
    identify_tag: string | null;
  };
};

export function ChatRoom({ tripId, isTerminal, currentUser }: Props) {
  const { status: wsStatus } = useWebSocket();
  const chat = useTripChat(tripId, currentUser);

  if (chat.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (chat.status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-sm text-destructive">
          {chat.errorCode === "TRIP_NOT_FOUND"
            ? "This trip is not available."
            : "Could not load chat. Please try again."}
        </p>
      </div>
    );
  }

  if (chat.status === "kicked") {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">
          You are no longer a member of this trip. Chat history is no longer
          available.
        </p>
      </div>
    );
  }

  const composerDisabled = isTerminal || wsStatus === "disconnected";

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <ConnectionBanner status={wsStatus} />
      <MessageList
        messages={chat.messages}
        currentUserId={currentUser.id}
        pendingClientIds={chat.pendingClientIds}
        failedClientIds={chat.failedClientIds}
        hasMoreOlder={chat.hasMoreOlder}
        isLoadingOlder={chat.isLoadingOlder}
        onLoadOlder={chat.loadOlder}
        onRetry={chat.retryPending}
      />
      {isTerminal ? (
        <div className="border-t border-border bg-muted/40 px-3 py-3 text-center text-xs text-muted-foreground">
          This trip is closed — sending new messages is disabled.
        </div>
      ) : (
        <Composer
          disabled={composerDisabled}
          isSending={chat.isSending}
          onSend={(content) => {
            void chat.sendMessage(content);
          }}
        />
      )}
    </div>
  );
}
