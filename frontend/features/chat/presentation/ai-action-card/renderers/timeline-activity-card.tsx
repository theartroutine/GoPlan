"use client";

import type { AIActionDisplay } from "@/features/chat/domain/ai-action-drafts";

import type { CardProps } from "../display-types";
import { CardShell } from "../card-shell";
import { Chip } from "../chip";
import { normalizeActionDisplay } from "../display-normalization";

type ActivityChip = NonNullable<AIActionDisplay["chips"]>[number];
type ActivityMeta = NonNullable<AIActionDisplay["meta"]>[number];

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  TRANSPORTATION: "Di chuyển",
  FOOD: "Ăn uống",
  CHECKIN_OUT: "Check-in / Check-out",
  FREE_TIME: "Thời gian tự do",
  SIGHTSEEING: "Tham quan",
  SHOPPING: "Mua sắm",
  ACCOMMODATION: "Lưu trú",
  OTHER: "Khác",
  DINING: "Ăn uống",
  NIGHTLIFE: "Giải trí đêm",
  TRANSPORT: "Di chuyển",
};

const ASSIGNEE_LABELS: Record<string, string> = {
  GROUP: "Cả nhóm",
  EVERYONE: "Cả nhóm",
  USER: "Thành viên được giao",
  NONE: "Chưa phân công",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function trimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatClock(value: string): string {
  const timePart = value.includes("T") ? value.split("T")[1] : value;
  const [hour, minute] = timePart.split(":");
  if (!hour || !minute) return value;
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function timeLabel(preview: Record<string, unknown>): string | null {
  const start = stringValue(preview, "start_time");
  const end = stringValue(preview, "end_time");
  if (start) {
    const startLabel = formatClock(start);
    return end ? `${startLabel} – ${formatClock(end)}` : startLabel;
  }
  const timeMode = stringValue(preview, "time_mode");
  if (timeMode === "ALL_DAY") return "Cả ngày";
  if (timeMode === "FLEXIBLE") return "Linh hoạt";
  return null;
}

function systemTypeLabel(preview: Record<string, unknown>): string | null {
  const systemType = stringValue(preview, "system_type");
  return systemType ? SYSTEM_TYPE_LABELS[systemType] ?? null : null;
}

function locationLabel(preview: Record<string, unknown>): string | null {
  const direct = stringValue(preview, "location_label");
  if (direct) return direct;
  const place = preview.place;
  if (!isRecord(place)) return null;
  return stringValue(place, "title") ?? stringValue(place, "address");
}

function appendChip(chips: ActivityChip[], chip: ActivityChip): void {
  if (chips.some((item) => item.label === chip.label)) return;
  chips.push(chip);
}

function appendMeta(meta: ActivityMeta[], label: string, value: string | null): void {
  if (!value || meta.some((item) => item.label === label)) return;
  meta.push({ label, value });
}

function buildPreviewChips(preview: Record<string, unknown>): ActivityChip[] {
  const chips: ActivityChip[] = [];
  const schedule = timeLabel(preview);
  if (schedule) chips.push({ icon: "clock", label: schedule });

  const location = locationLabel(preview);
  if (location) chips.push({ icon: "map-pin", label: location });

  const assigneeScope = stringValue(preview, "assignee_scope");
  const assignee = assigneeScope ? ASSIGNEE_LABELS[assigneeScope] : null;
  if (assignee) chips.push({ icon: "users", label: assignee });

  return chips;
}

function buildPreviewMeta(preview: Record<string, unknown>): ActivityMeta[] {
  const meta: ActivityMeta[] = [];
  appendMeta(meta, "Điểm hẹn", stringValue(preview, "meeting_point"));
  appendMeta(meta, "Ghi chú địa điểm", stringValue(preview, "location_note"));
  appendMeta(meta, "Ghi chú", stringValue(preview, "note"));

  const contactName = stringValue(preview, "contact_name");
  const contactPhone = stringValue(preview, "contact_phone");
  if (contactName && contactPhone) {
    appendMeta(meta, "Liên hệ", `${contactName} · ${contactPhone}`);
  } else {
    appendMeta(meta, "Liên hệ", contactName);
    appendMeta(meta, "Số điện thoại", contactPhone);
  }

  appendMeta(meta, "Mã đặt chỗ", stringValue(preview, "booking_reference"));
  appendMeta(meta, "Liên kết", stringValue(preview, "external_link"));
  return meta;
}

function activityDisplay(draft: CardProps["draft"]): AIActionDisplay {
  const preview = draft.preview;
  const display = normalizeActionDisplay(draft.display);
  const previewTitle = stringValue(preview, "title");
  const systemLabel = systemTypeLabel(preview);
  const chips = Array.isArray(display.chips) ? [...display.chips] : [];
  const meta = Array.isArray(display.meta) ? [...display.meta] : [];

  for (const chip of buildPreviewChips(preview)) appendChip(chips, chip);
  for (const item of buildPreviewMeta(preview)) {
    appendMeta(meta, item.label, item.value);
  }

  const displayTitle = trimmedText(display.title);
  const displayKicker = trimmedText(display.kicker);
  const isGenericActivityKicker =
    displayKicker === "Activity · Activity" ||
    displayKicker === "Hoạt động · Hoạt động";

  return {
    ...display,
    icon: display.icon ?? "activity",
    tone: display.tone ?? "neutral",
    title: displayTitle || previewTitle || "Hoạt động",
    kicker:
      (!displayKicker || isGenericActivityKicker) && systemLabel
        ? `Hoạt động · ${systemLabel}`
        : displayKicker || "Hoạt động",
    chips: chips.length ? chips : undefined,
    meta: meta.length ? meta : undefined,
  };
}

export function TimelineActivityCard({
  draft,
  editorSlot,
  actionsSlot,
  helperOverride,
  errorOverride,
}: CardProps) {
  const display = activityDisplay(draft);
  const chips = display.chips ?? [];
  const meta = display.meta ?? [];
  return (
    <CardShell
      display={display}
      status={draft.status}
      editorSlot={editorSlot}
      actionsSlot={actionsSlot}
      helper={helperOverride}
      error={errorOverride}
    >
      {chips.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {chips.map((c, i) => (
            <Chip key={`${c.label}-${i}`} icon={c.icon} label={c.label} />
          ))}
        </div>
      ) : null}
      {meta.length ? (
        <dl className="mt-2 space-y-1 text-xs">
          {meta.map((item) => (
            <div key={item.label} className="flex gap-2">
              <dt className="shrink-0 text-muted-foreground">{item.label}:</dt>
              <dd className="min-w-0 break-words">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </CardShell>
  );
}
