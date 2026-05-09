"use client";

import { useEffect, useState } from "react";

import type { WsConnectionStatus } from "@/features/realtime/domain/types";

const SHOW_DELAY_MS = 2500;
const ESCALATE_DELAY_MS = 10_000;

type Tone = "muted" | "amber";

const COPY: Record<"reconnecting" | "disconnected", string> = {
  reconnecting:
    "Reconnecting — you can keep reading; new messages will catch up.",
  disconnected: "Disconnected. Trying again shortly…",
};

const TONE_CLASS: Record<Tone, string> = {
  muted: "bg-muted/60 text-muted-foreground",
  amber:
    "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
};

export function ConnectionBanner({ status }: { status: WsConnectionStatus }) {
  // First connect AND recovery don't warn the user — `connecting` is normal.
  // The non-connected variants delegate to a child keyed by status so timers
  // reset cleanly without setState-in-effect on the recovery transition.
  if (status === "connected" || status === "connecting") return null;
  return <NonConnectedBanner key={status} status={status} />;
}

function NonConnectedBanner({
  status,
}: {
  status: "reconnecting" | "disconnected";
}) {
  const [visible, setVisible] = useState(false);
  const [escalated, setEscalated] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    const escalateTimer = setTimeout(
      () => setEscalated(true),
      ESCALATE_DELAY_MS,
    );
    return () => {
      clearTimeout(showTimer);
      clearTimeout(escalateTimer);
    };
  }, []);

  if (!visible) return null;

  const tone: Tone = escalated ? "amber" : "muted";
  return (
    <div
      role="status"
      className={`px-3 py-1.5 text-xs ${TONE_CLASS[tone]}`}
      aria-live="polite"
    >
      {COPY[status]}
    </div>
  );
}
