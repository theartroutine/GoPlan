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

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows waiting state for unauthorized ready drafts", () => {
    render(
      <AIActionCard
        tripId="trip-1"
        draft={makeDraft({ can_confirm: false, can_cancel: false })}
        onDraftChanged={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Waiting for the authorized member to confirm."),
    ).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("CONFIRMED")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("EXPIRED")).toBeInTheDocument();
    expect(screen.getByText("Draft expired.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(onDraftChanged).toHaveBeenCalledWith(expiredDraft);
  });

  it("edits missing fields for needs-info drafts", async () => {
    vi.mocked(patchAIActionDraft).mockResolvedValueOnce({
      draft: makeDraft({
        status: "READY",
        missing_fields: [],
        preview: { title: "Lunch", total_amount: "500000" },
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
    expect(await screen.findByText("READY")).toBeInTheDocument();
  });

  it("edits missing fields when can_edit is true without cancel permission", async () => {
    vi.mocked(patchAIActionDraft).mockResolvedValueOnce({
      draft: makeDraft({
        status: "READY",
        can_confirm: true,
        can_cancel: false,
        can_edit: false,
        missing_fields: [],
        preview: { title: "Museum", status: "IN_PROGRESS" },
      }),
    });
    render(
      <AIActionCard
        tripId="trip-1"
        draft={makeDraft({
          status: "NEEDS_INFO",
          can_confirm: false,
          can_cancel: false,
          can_edit: true,
          missing_fields: [
            {
              name: "status",
              label: "Status",
              type: "select",
              options: [{ label: "In Progress", value: "IN_PROGRESS" }],
            },
          ],
          preview: { title: "Museum" },
        })}
        onDraftChanged={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "IN_PROGRESS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save info" }));

    expect(patchAIActionDraft).toHaveBeenCalledWith("trip-1", "draft-1", {
      status: "IN_PROGRESS",
    });
    expect(await screen.findByText("READY")).toBeInTheDocument();
  });

  it("sends selected field option values when editing missing fields", async () => {
    vi.mocked(patchAIActionDraft).mockResolvedValueOnce({
      draft: makeDraft({ status: "READY", missing_fields: [] }),
    });
    render(
      <AIActionCard
        tripId="trip-1"
        draft={makeDraft({
          status: "NEEDS_INFO",
          can_confirm: false,
          can_cancel: true,
          can_edit: true,
          missing_fields: [
            {
              name: "section_id",
              label: "Timeline day",
              type: "select",
              options: [
                { label: "Day 1", value: "section-1" },
                { label: "Day 2", value: "section-2" },
              ],
            },
          ],
        })}
        onDraftChanged={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Timeline day"), {
      target: { value: "section-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save info" }));

    expect(patchAIActionDraft).toHaveBeenCalledWith("trip-1", "draft-1", {
      section_id: "section-2",
    });
  });

  it("parses JSON field values before patching drafts", async () => {
    vi.mocked(patchAIActionDraft).mockResolvedValueOnce({
      draft: makeDraft({ status: "READY", missing_fields: [] }),
    });
    render(
      <AIActionCard
        tripId="trip-1"
        draft={makeDraft({
          status: "NEEDS_INFO",
          can_confirm: false,
          can_cancel: true,
          can_edit: true,
          missing_fields: [
            { name: "data", label: "Activity details", type: "json" },
          ],
        })}
        onDraftChanged={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Activity details"), {
      target: { value: '{"title":"Museum"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save info" }));

    expect(patchAIActionDraft).toHaveBeenCalledWith("trip-1", "draft-1", {
      data: { title: "Museum" },
    });
  });

  it("shows expired drafts without action buttons", () => {
    render(
      <AIActionCard
        tripId="trip-1"
        draft={makeDraft({
          status: "EXPIRED",
          can_confirm: false,
          can_cancel: false,
        })}
        onDraftChanged={vi.fn()}
      />,
    );

    expect(screen.getByText("EXPIRED")).toBeInTheDocument();
    expect(
      screen.getByText("This draft expired. Ask GoPlanAI to regenerate it."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("does not render editable controls for missing target identity fields", () => {
    render(
      <AIActionCard
        tripId="trip-1"
        draft={makeDraft({
          status: "NEEDS_INFO",
          can_confirm: false,
          can_cancel: true,
          can_edit: true,
          missing_fields: [
            { name: "activity_id", label: "Activity", type: "target" },
          ],
        })}
        onDraftChanged={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Ask GoPlanAI to clarify the target."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Activity")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save info" })).toBeNull();
  });
});
