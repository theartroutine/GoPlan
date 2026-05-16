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

    expect(await screen.findByText("Confirmed")).toBeInTheDocument();
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

    expect(await screen.findByText("Expired")).toBeInTheDocument();
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
    expect(await screen.findByText("Ready")).toBeInTheDocument();
  });
});
