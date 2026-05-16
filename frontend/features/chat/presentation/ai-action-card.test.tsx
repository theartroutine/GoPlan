import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AIActionDraft } from "@/features/chat/domain/ai-action-drafts";
import {
  confirmAIActionDraft,
  patchAIActionDraft,
} from "@/features/chat/infrastructure/ai-action-drafts-api";
import { AIActionCard } from "@/features/chat/presentation/ai-action-card";

vi.mock("@/features/chat/infrastructure/ai-action-drafts-api", () => ({
  cancelAIActionDraft: vi.fn(),
  confirmAIActionDraft: vi.fn(),
  patchAIActionDraft: vi.fn(),
}));

vi.mock("@/features/trips/presentation/trip-context", () => ({
  useTripContext: () => ({
    tripId: "trip-1",
    data: { timezone: "UTC", currency_code: "VND" },
    loading: false,
    error: null,
    notFound: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function makeDraft(overrides: Partial<AIActionDraft> = {}): AIActionDraft {
  return {
    id: "draft-1",
    action_type: "expense.create",
    status: "READY",
    required_confirmation: "CAPTAIN",
    can_confirm: true,
    can_cancel: true,
    can_edit: false,
    preview: { title: "Dinner", amount: "1,200,000 VND" },
    display: {
      icon: "expense",
      kicker: "Expense",
      title: "Dinner",
      tone: "create",
      hero: { kind: "amount", value: "1,200,000", currency: "VND" },
    },
    summary: "[READY] expense.create: Dinner",
    missing_fields: [],
    result: {},
    error_code: "",
    error_detail: "",
    expires_at: "2026-06-01T00:00:00Z",
    created_at: "2026-05-13T00:00:00Z",
    updated_at: "2026-05-13T00:00:00Z",
    ...overrides,
  };
}

describe("AIActionCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows confirm and cancel for authorized ready drafts", () => {
    render(
      <AIActionCard
        tripId="trip-1"
        draft={makeDraft()}
        onDraftChanged={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Confirm/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
  });

  it("hides action buttons for unauthorized ready drafts", () => {
    render(
      <AIActionCard
        tripId="trip-1"
        draft={makeDraft({ can_confirm: false, can_cancel: false })}
        onDraftChanged={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Confirm/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Cancel/i })).toBeNull();
  });

  it("calls confirm handler and reports changed draft", async () => {
    vi.mocked(confirmAIActionDraft).mockResolvedValueOnce({
      draft: makeDraft({
        status: "CONFIRMED",
        can_confirm: false,
        can_cancel: false,
      }),
    });
    const onDraftChanged = vi.fn();
    render(
      <AIActionCard
        tripId="trip-1"
        draft={makeDraft()}
        onDraftChanged={onDraftChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));

    expect(
      await screen.findByRole("img", { name: "Confirmed" }),
    ).toBeInTheDocument();
    expect(onDraftChanged).toHaveBeenCalledWith(
      expect.objectContaining({ status: "CONFIRMED" }),
    );
  });

  it("applies draft returned by confirm error responses", async () => {
    const expiredDraft = makeDraft({
      status: "EXPIRED",
      can_confirm: false,
      can_cancel: false,
    });
    vi.mocked(confirmAIActionDraft).mockRejectedValueOnce({
      response: {
        data: {
          detail: "Draft expired.",
          draft: expiredDraft,
        },
      },
    });
    const onDraftChanged = vi.fn();
    render(
      <AIActionCard
        tripId="trip-1"
        draft={makeDraft()}
        onDraftChanged={onDraftChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));

    expect(
      await screen.findByRole("img", { name: "Expired" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Draft expired.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm/i })).toBeNull();
    expect(onDraftChanged).toHaveBeenCalledWith(expiredDraft);
  });

  it("edits missing fields for needs-info drafts", async () => {
    vi.mocked(patchAIActionDraft).mockResolvedValueOnce({
      draft: makeDraft({
        status: "READY",
        missing_fields: [],
        preview: { title: "Lunch", total_amount: "500000" },
        display: {
          icon: "expense",
          kicker: "Expense",
          title: "Lunch",
          tone: "create",
          hero: { kind: "amount", value: "500,000", currency: "VND" },
        },
      }),
    });
    const onDraftChanged = vi.fn();
    render(
      <AIActionCard
        tripId="trip-1"
        draft={makeDraft({
          status: "NEEDS_INFO",
          can_confirm: false,
          can_cancel: true,
          can_edit: true,
          missing_fields: [{ name: "total_amount", label: "Amount" }],
          preview: { title: "Lunch" },
          display: {
            icon: "expense",
            kicker: "Expense",
            title: "Lunch",
            tone: "create",
          },
        })}
        onDraftChanged={onDraftChanged}
      />,
    );

    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "500000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save info" }));

    expect(patchAIActionDraft).toHaveBeenCalledWith("trip-1", "draft-1", {
      total_amount: "500000",
    });
    expect(
      await screen.findByRole("img", { name: "Ready" }),
    ).toBeInTheDocument();
  });

  it("renders timeline activity details from preview when display is sparse", () => {
    render(
      <AIActionCard
        tripId="trip-1"
        draft={makeDraft({
          action_type: "timeline.activity.create",
          can_confirm: false,
          can_cancel: false,
          preview: {
            title: "Dinh I",
            system_type: "SIGHTSEEING",
            time_mode: "TIME_RANGE",
            start_time: "08:30:00",
            end_time: "10:00:00",
            location_label: "Dinh I Palace",
            location_note: "Enter through the main gate",
            assignee_scope: "EVERYONE",
            note: "Keep the visit relaxed.",
            meeting_point: "Hotel lobby",
          },
          display: {
            icon: "activity",
            kicker: "Activity · Activity",
            title: "",
            tone: "create",
            chips: [{ icon: "users", label: "Whole group" }],
          },
        })}
        onDraftChanged={vi.fn()}
      />,
    );

    expect(screen.getByText("Dinh I")).toBeInTheDocument();
    expect(screen.queryByText("Activity · Sightseeing")).toBeNull();
    expect(screen.getByText("08:30 – 10:00")).toBeInTheDocument();
    expect(screen.getByText("Dinh I Palace")).toBeInTheDocument();
    expect(screen.getByText("Hotel lobby")).toBeInTheDocument();
    expect(screen.getByText("Keep the visit relaxed.")).toBeInTheDocument();
    expect(screen.getByText("Enter through the main gate")).toBeInTheDocument();
  });

  it("renders timeline activity from preview when display text fields are missing", () => {
    render(
      <AIActionCard
        tripId="trip-1"
        draft={makeDraft({
          action_type: "timeline.activity.create",
          can_confirm: false,
          can_cancel: false,
          preview: {
            title: "Dinh I",
            system_type: "SIGHTSEEING",
          },
          display: {} as AIActionDraft["display"],
        })}
        onDraftChanged={vi.fn()}
      />,
    );

    expect(screen.getByText("Dinh I")).toBeInTheDocument();
    expect(screen.queryByText("Activity · Sightseeing")).toBeNull();
  });
});
