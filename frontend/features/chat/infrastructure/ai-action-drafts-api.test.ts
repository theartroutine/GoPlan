import { describe, expect, it, vi } from "vitest";

import {
  cancelAIActionDraft,
  confirmAIActionDraft,
  patchAIActionDraft,
} from "@/features/chat/infrastructure/ai-action-drafts-api";
import { bff } from "@/shared/http/bff-client";

vi.mock("@/shared/http/bff-client", () => ({
  bff: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

describe("ai-action-drafts-api", () => {
  it("patches missing draft payload through BFF", async () => {
    vi.mocked(bff.patch).mockResolvedValueOnce({
      data: { draft: { id: "draft-1" } },
    });

    await patchAIActionDraft("trip 1", "draft 1", { total_amount: "500000" });

    expect(bff.patch).toHaveBeenCalledWith(
      "/api/trips/trip%201/ai/action-drafts/draft%201",
      { payload: { total_amount: "500000" } },
    );
  });

  it("confirms and cancels through BFF", async () => {
    vi.mocked(bff.post)
      .mockResolvedValueOnce({ data: { draft: { id: "draft-1" } } })
      .mockResolvedValueOnce({ data: { draft: { id: "draft-1" } } });

    await confirmAIActionDraft("trip-1", "draft-1");
    await cancelAIActionDraft("trip-1", "draft-1");

    expect(bff.post).toHaveBeenNthCalledWith(
      1,
      "/api/trips/trip-1/ai/action-drafts/draft-1/confirm",
    );
    expect(bff.post).toHaveBeenNthCalledWith(
      2,
      "/api/trips/trip-1/ai/action-drafts/draft-1/cancel",
    );
  });
});
