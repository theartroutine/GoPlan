type AuthChannelMessage =
  | { type: "logout" }
  | { type: "profile_completed" }
  | { type: "email_verified" };

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel("auth");
  }
  return channel;
}

export function broadcastLogout(): void {
  getChannel()?.postMessage({ type: "logout" } satisfies AuthChannelMessage);
}

export function broadcastProfileCompleted(): void {
  getChannel()?.postMessage({ type: "profile_completed" } satisfies AuthChannelMessage);
}

export function broadcastEmailVerified(): void {
  getChannel()?.postMessage({ type: "email_verified" } satisfies AuthChannelMessage);
}

export function onAuthMessage(callback: (msg: AuthChannelMessage) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};

  const handler = (event: MessageEvent<AuthChannelMessage>) => {
    callback(event.data);
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
