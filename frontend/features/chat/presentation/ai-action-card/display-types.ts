import type { ReactNode } from "react";

import type {
  AIActionDisplay,
  AIActionDraft,
} from "@/features/chat/domain/ai-action-drafts";

export type CardProps = {
  tripId: string;
  draft: AIActionDraft;
  onDraftChanged: (draft: AIActionDraft) => void;
  editorSlot?: ReactNode;
  actionsSlot?: ReactNode;
  helperOverride?: string | null;
  errorOverride?: string | null;
};

export type CardRenderer = (props: CardProps) => ReactNode;

export type ChipIcon = NonNullable<
  NonNullable<AIActionDisplay["chips"]>[number]["icon"]
>;
