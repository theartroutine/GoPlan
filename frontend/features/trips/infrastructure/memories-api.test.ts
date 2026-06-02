import { beforeEach, describe, expect, it, vi } from "vitest";

const bffMock = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/shared/http/bff-client", () => ({
  bff: bffMock,
}));

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";
import {
  bffCreateTripMemory,
  bffDeleteTripMemory,
  bffDisableTripMemoryShareLink,
  bffEnableTripMemoryShareLink,
  bffFetchTripMemoryAssetBlob,
  bffGetTripMemoryCreateOptions,
  bffListTripMemories,
  bffListTripMemoryStatuses,
  bffUpdateTripMemory,
} from "@/features/trips/infrastructure/memories-api";

const MEMORY: TripMemoryVideo = {
  id: "memory_1",
  trip_id: "trip_1",
  title: "Da Nang recap",
  status: "ready",
  source_mode: "manual",
  source_photo_count: 8,
  music: { key: "sunrise-road", title: "Sunrise Road", artist: "GoPlan" },
  duration_seconds: 32,
  created_by: { id: "user_1", display_name: "Minh" },
  can_manage: true,
  can_download: true,
  render_error: null,
  share: { enabled: false, url: null },
  created_at: "2026-05-24T01:00:00Z",
  updated_at: "2026-05-24T01:01:00Z",
};

describe("memories-api", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists trip memories through encoded BFF path and extracts cursors", async () => {
    const signal = new AbortController().signal;
    bffMock.get.mockResolvedValue({
      data: {
        next: "https://api.example.com/api/trips/trip%201/memories?cursor=next-page",
        previous: "https://api.example.com/api/trips/trip%201/memories?cursor=prev-page",
        results: [MEMORY],
      },
    });

    await expect(
      bffListTripMemories("trip 1", {
        cursor: "current-page",
        pageSize: 20,
        signal,
      }),
    ).resolves.toEqual({
      nextCursor: "next-page",
      previousCursor: "prev-page",
      results: [MEMORY],
    });

    expect(bffMock.get).toHaveBeenCalledWith("/api/trips/trip%201/memories", {
      params: { cursor: "current-page", page_size: 20 },
      signal,
    });
  });

  it("lists selected memory statuses through the status BFF route", async () => {
    const signal = new AbortController().signal;
    bffMock.get.mockResolvedValueOnce({ data: { results: [MEMORY] } });

    await expect(
      bffListTripMemoryStatuses("trip 1", ["memory 1", "memory/2"], { signal }),
    ).resolves.toEqual({ results: [MEMORY] });

    expect(bffMock.get).toHaveBeenCalledWith(
      "/api/trips/trip%201/memories/status",
      expect.objectContaining({ signal }),
    );
    const requestConfig = bffMock.get.mock.calls[0][1] as { params: URLSearchParams };
    expect(requestConfig.params.toString()).toBe("ids=memory+1&ids=memory%2F2");
  });

  it("loads memory create options with photo limits", async () => {
    bffMock.get.mockResolvedValueOnce({
      data: { photo_limits: { min: 3, max: 12, auto_pick: 8 } },
    });

    await expect(bffGetTripMemoryCreateOptions("trip/1")).resolves.toEqual({
      photo_limits: { min: 3, max: 12, auto_pick: 8 },
    });

    expect(bffMock.get).toHaveBeenCalledWith(
      "/api/trips/trip%2F1/memories/create-options",
    );
  });

  it("creates, updates, and deletes memories through encoded BFF routes", async () => {
    bffMock.post.mockResolvedValueOnce({ data: { memory: MEMORY } });
    bffMock.patch.mockResolvedValueOnce({ data: { memory: { ...MEMORY, title: "Updated" } } });
    bffMock.delete.mockResolvedValueOnce({ data: null });

    await expect(
      bffCreateTripMemory("trip/1", {
        source_mode: "manual",
        photo_ids: ["photo_1", "photo_2"],
        title: "Da Nang recap",
      }),
    ).resolves.toBe(MEMORY);
    await expect(
      bffUpdateTripMemory("trip/1", "memory/1", { title: "Updated" }),
    ).resolves.toMatchObject({ title: "Updated" });
    await expect(bffDeleteTripMemory("trip/1", "memory/1")).resolves.toBeUndefined();

    expect(bffMock.post).toHaveBeenCalledWith("/api/trips/trip%2F1/memories", {
      source_mode: "manual",
      photo_ids: ["photo_1", "photo_2"],
      title: "Da Nang recap",
    });
    expect(bffMock.patch).toHaveBeenCalledWith(
      "/api/trips/trip%2F1/memories/memory%2F1",
      { title: "Updated" },
    );
    expect(bffMock.delete).toHaveBeenCalledWith(
      "/api/trips/trip%2F1/memories/memory%2F1",
    );
  });

  it("enables and disables share links", async () => {
    const share = { enabled: true, url: "https://goplan.test/memories/share-1" };
    bffMock.post.mockResolvedValueOnce({ data: { share } });
    bffMock.delete.mockResolvedValueOnce({ data: { share: { enabled: false, url: null } } });

    await expect(bffEnableTripMemoryShareLink("trip 1", "memory 1")).resolves.toBe(share);
    await expect(bffDisableTripMemoryShareLink("trip 1", "memory 1")).resolves.toEqual({
      enabled: false,
      url: null,
    });

    expect(bffMock.post).toHaveBeenCalledWith(
      "/api/trips/trip%201/memories/memory%201/share-link",
    );
    expect(bffMock.delete).toHaveBeenCalledWith(
      "/api/trips/trip%201/memories/memory%201/share-link",
    );
  });

  it("fetches memory assets as blobs through the BFF route", async () => {
    const signal = new AbortController().signal;
    const posterBlob = new Blob(["poster"], { type: "image/webp" });
    bffMock.get.mockResolvedValueOnce({ data: posterBlob });

    await expect(
      bffFetchTripMemoryAssetBlob("trip/1", "memory/1", "poster", { signal }),
    ).resolves.toBe(posterBlob);

    expect(bffMock.get).toHaveBeenCalledWith(
      "/api/trips/trip%2F1/memories/memory%2F1/poster",
      {
        responseType: "blob",
        signal,
      },
    );
  });

  it("parses JSON error blobs from failed memory asset responses", async () => {
    const error = {
      response: {
        status: 409,
        headers: { "content-type": "application/json" },
        data: new Blob(
          [
            JSON.stringify({
              detail: "Memory video is not ready yet.",
              error_code: "MEMORY_NOT_READY",
            }),
          ],
          { type: "application/json" },
        ),
      },
    };
    bffMock.get.mockRejectedValueOnce(error);

    await expect(
      bffFetchTripMemoryAssetBlob("trip/1", "memory/1", "video"),
    ).rejects.toBe(error);

    expect(error.response.data).toEqual({
      detail: "Memory video is not ready yet.",
      error_code: "MEMORY_NOT_READY",
    });
  });
});
