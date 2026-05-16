export type AIActionDraftStatus =
  | "NEEDS_INFO"
  | "READY"
  | "CONFIRMED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED";

export type AIActionDraftConfirmation =
  | "CAPTAIN"
  | "TIMELINE_ACTIVITY_STATUS"
  | "TRANSFER_PAYER"
  | "TRANSFER_RECIPIENT";

export type AIActionDisplay = {
  kicker: string;
  title: string;
  icon: "activity" | "expense" | "settlement" | "transfer" | "info";
  tone: "neutral" | "create" | "update" | "destroy";
  chips?: Array<{ icon?: "clock" | "calendar" | "map-pin" | "users" | "user"; label: string }>;
  hero?:
    | { kind: "amount"; value: string; currency: string }
    | { kind: "datetime"; start: string; end?: string };
  meta?: Array<{ label: string; value: string }>;
};

export type AIActionDraftMissingField = {
  name: string;
  label: string;
  type?: string;
  options?: Array<{ label: string; value: string }>;
};

export type AIActionDraft = {
  id: string;
  action_type: string;
  status: AIActionDraftStatus;
  required_confirmation: AIActionDraftConfirmation;
  can_confirm: boolean;
  can_cancel: boolean;
  can_edit: boolean;
  display: AIActionDisplay;
  summary: string;
  preview: Record<string, unknown>;
  missing_fields: AIActionDraftMissingField[];
  result: Record<string, unknown>;
  error_code: string;
  error_detail: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type AIActionDraftEnvelope = {
  draft: AIActionDraft;
};
